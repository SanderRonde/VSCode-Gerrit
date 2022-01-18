import {
	DEFAULT_GIT_REVIEW_FILE,
	getGitReviewFileCached,
	GitReviewFile,
} from '../credentials/gitReviewFile';
import {
	window,
	Disposable,
	extensions,
	Uri,
	env,
	ConfigurationTarget,
	ProgressLocation,
} from 'vscode';
import { ChangeTreeView } from '../../views/activityBar/changes/changeTreeView';
import { APISubscriptionManager } from '../subscriptions/subscriptions';
import { API, GitExtension } from '../../types/vscode-extension-git';
import { getLastCommits, GitCommit, tryExecAsync } from './gitCLI';
import { PERIODICAL_GIT_FETCH_INTERVAL } from '../util/constants';
import { MATCH_ANY } from '../subscriptions/baseSubscriptions';
import { createAwaitingInterval } from '../util/util';
import { getConfiguration } from '../vscode/config';
import { VersionNumber } from '../util/version';
import { getCurrentChangeID } from './commit';
import { rebase } from './rebase';
import { log } from '../util/log';

export function getGitAPI(): API | null {
	const extension = extensions.getExtension<GitExtension>('vscode.git');
	if (!extension) {
		return null;
	}
	return extension?.exports.getAPI(1);
}

export async function onChangeLastCommit(
	handler: (lastCommit: GitCommit) => void | Promise<void>,
	callInitial = false
): Promise<Disposable> {
	const gitAPI = getGitAPI();
	if (!gitAPI) {
		return { dispose: () => {} };
	}

	let currentLastCommit = (await getLastCommits(1))[0];
	if (callInitial && currentLastCommit) {
		await handler(currentLastCommit);
	}
	const interval = createAwaitingInterval(async () => {
		const newLastCommit = (await getLastCommits(1))[0];
		if (!newLastCommit) {
			return;
		}
		if (!currentLastCommit) {
			currentLastCommit = newLastCommit;
			await handler(currentLastCommit);
			return;
		}
		if (
			newLastCommit.hash !== currentLastCommit.hash ||
			newLastCommit.message !== currentLastCommit.message
		) {
			currentLastCommit = newLastCommit;
			await handler(currentLastCommit);
		}
	}, PERIODICAL_GIT_FETCH_INTERVAL);

	return interval;
}

export async function createStash(
	uri: string,
	stashName: string
): Promise<boolean> {
	if (
		!(
			await tryExecAsync(`git stash push -u -m "${stashName}"`, {
				cwd: uri,
			})
		).success
	) {
		void window.showErrorMessage(
			'Failed to create stash, see log for details'
		);
		return false;
	}
	return true;
}

export async function findStash(
	uri: string,
	query: string,
	operation: string
): Promise<string | boolean> {
	const { success: listSuccess, stdout } = await tryExecAsync(
		'git stash list',
		{
			cwd: uri,
		}
	);
	if (!listSuccess) {
		void window.showErrorMessage(
			'Failed to read stashes, see log for details'
		);
		return false;
	}
	const stashes = stdout
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	const line = stashes.find((stash) => {
		return stash.includes(query);
	});
	if (!line) {
		const YES_OPTION = 'Yes';
		const NO_OPTION = 'No, cancel operation';
		const result = await window.showErrorMessage(
			`Failed to find git stash, skip ${operation} "${query}"?`,
			YES_OPTION,
			NO_OPTION
		);
		if (result === YES_OPTION) {
			return true;
		}
		return false;
	}
	return line.split(':')[0];
}

export async function dropStash(
	uri: string,
	stashName: string
): Promise<boolean> {
	const stash = await findStash(uri, stashName, 'dropping of git stash');
	if (typeof stash === 'boolean') {
		return stash;
	}

	const { success } = await tryExecAsync(`git stash drop "${stash}"`, {
		cwd: uri,
	});
	if (!success) {
		void window.showErrorMessage(
			'Failed to drop stash, see log for details'
		);
		return false;
	}
	return true;
}

export async function ensureCleanWorkingTree(
	gitURI: string,
	silent: boolean = false
): Promise<boolean> {
	{
		const { success } = await tryExecAsync(
			'git diff --ignore-submodules --quiet',
			{
				cwd: gitURI,
				silent,
			}
		);
		if (!success) {
			if (!silent) {
				void window.showErrorMessage(
					'You have unstaged changes. Please commit or stash them and try again'
				);
			}
			return false;
		}
	}

	{
		const { success } = await tryExecAsync(
			'git diff --cached --ignore-submodules --quiet',
			{
				cwd: gitURI,
				silent,
			}
		);
		if (!success) {
			if (!silent) {
				void window.showErrorMessage(
					'You have uncommitted changes. Please commit or stash them and try again'
				);
			}
			return false;
		}
	}

	return true;
}

export async function ensureMainBranchUpdated(
	uri: string,
	gitReviewFile: GitReviewFile
): Promise<string | false> {
	const remote =
		gitReviewFile.remote ??
		gitReviewFile.defaultremote ??
		DEFAULT_GIT_REVIEW_FILE.remote;

	{
		const { success } = await tryExecAsync(`git remote update ${remote}`, {
			cwd: uri,
		});
		if (!success) {
			void window.showErrorMessage(
				'Failed to update remote, please check the log panel for details.'
			);
			return false;
		}
	}

	return remote;
}

export async function getGitVersion(
	uri: string
): Promise<VersionNumber | null> {
	const gitVersion = await (async (): Promise<VersionNumber | null> => {
		const { stdout, success } = await tryExecAsync('git version', {
			cwd: uri,
		});
		if (!success) {
			return null;
		}

		try {
			const str = stdout.split(' ').pop();
			if (!str) {
				return null;
			}
			return VersionNumber.from(str);
		} catch (e) {
			log(`Failed to parse git version: ${(e as Error).toString()}`);
			return null;
		}
	})();

	if (!gitVersion) {
		void window.showErrorMessage(
			'Failed to get git version, please check the log panel for details.'
		);
		return null;
	}
	return gitVersion;
}

async function ensureNoRebaseErrors(): Promise<boolean> {
	const gitReviewFile = await getGitReviewFileCached();
	const gitURI = getGitURI();

	if (!gitURI || !gitReviewFile || !(await ensureCleanWorkingTree(gitURI))) {
		return false;
	}

	const gitVersion = await getGitVersion(gitURI);
	if (!gitVersion) {
		return false;
	}

	const remoteBranch =
		gitReviewFile.branch ??
		gitReviewFile.defaultbranch ??
		DEFAULT_GIT_REVIEW_FILE.branch;
	return rebase(remoteBranch, gitVersion, gitURI, {
		title: 'Run Git Review',
		callback: () => {
			const terminal = window.createTerminal('Git Review');
			terminal.show(false);
			terminal.sendText('git review', true);
		},
	});
}

export function getGitURI(): string | null {
	const api = getGitAPI();
	if (!api || !api.repositories.length) {
		void window.showErrorMessage('No git repo found');
		return null;
	}

	if (api.repositories.length > 1) {
		void window.showErrorMessage('Multi-git-repo setups are not supported');
		return null;
	}

	return api.repositories[0].rootUri.fsPath;
}

function changeStrToID(changeID: string): string {
	if (changeID.indexOf('~') === 0) {
		return changeID;
	}
	const [, , id] = changeID.split('~');
	return id;
}

export async function gitCheckoutRemote(
	patchNumberOrChangeID: number | string,
	silent: boolean = false
): Promise<void> {
	const uri = getGitURI();
	if (!uri || !(await ensureCleanWorkingTree(uri))) {
		return;
	}

	const checkoutString =
		typeof patchNumberOrChangeID === 'string'
			? changeStrToID(patchNumberOrChangeID)
			: patchNumberOrChangeID;
	const { success, stdout } = await tryExecAsync(
		`git-review -d "${String(checkoutString)}"`,
		{
			cwd: uri,
			timeout: 10000,
		}
	);

	if (success) {
		if (!silent) {
			void window.showInformationMessage(stdout);
		}
	} else {
		void window.showErrorMessage(
			'Checkout failed. Please see log for more details'
		);
	}
}

const URL_REGEX = /http(s)?[:\w./+]+/g;
export async function gitReview(): Promise<void> {
	const { success, stdout, handled } = await window.withProgress<{
		success: boolean;
		stdout: string;
		handled: boolean;
	}>(
		{
			location: ProgressLocation.SourceControl,
			title: 'Pushing for review',
		},
		async (progress) => {
			progress.report({
				message: 'Ensuring no rebase errors',
			});
			const uri = getGitURI();
			if (!uri) {
				return {
					success: false,
					handled: true,
					stdout: '',
				};
			}

			if (!(await ensureNoRebaseErrors())) {
				return {
					success: false,
					handled: true,
					stdout: '',
				};
			}
			progress.report({
				increment: 10,
			});

			progress.report({
				message: 'Pushing for review',
			});
			const { success, stdout } = await tryExecAsync('git-review', {
				cwd: uri,
				timeout: 10000,
			});
			progress.report({
				increment: 90,
			});

			return {
				success,
				stdout,
				handled: false,
			};
		}
	);

	const changeID = await getCurrentChangeID();
	if (changeID) {
		await APISubscriptionManager.changeSubscriptions.invalidate({
			changeID,
			field: MATCH_ANY,
			withValues: MATCH_ANY,
		});
	}

	if (success) {
		const config = getConfiguration();
		if (!config.get('gerrit.messages.postReviewNotification', true)) {
			return;
		}

		const url = stdout.match(URL_REGEX)?.[0];
		const disableMessageOption = 'Disable This Message';
		if (url) {
			const viewRemoteOption = 'View Remote';
			const openReviewPanelOption = 'Open Review Panel';
			const result = await window.showInformationMessage(
				`Successfully pushed for review to ${url}`,
				viewRemoteOption,
				openReviewPanelOption,
				disableMessageOption
			);
			if (result === viewRemoteOption) {
				await env.openExternal(Uri.parse(url));
			} else if (result === openReviewPanelOption) {
				const changeID = await getCurrentChangeID();
				if (!changeID) {
					void window.showErrorMessage(
						'Failed to get current change ID'
					);
				} else {
					await ChangeTreeView.openInReview(changeID);
				}
			} else if (result === disableMessageOption) {
				await config.update(
					'gerrit.messages.postReviewNotification',
					false,
					ConfigurationTarget.Global
				);
			}
		} else {
			if (
				(await window.showInformationMessage(
					'Successfully pushed for review',
					disableMessageOption
				)) === disableMessageOption
			) {
				await config.update(
					'gerrit.messages.postReviewNotification',
					false,
					ConfigurationTarget.Global
				);
			}
		}
	} else if (!handled) {
		void window.showErrorMessage(
			'Git review failed, please see log for more details'
		);
	}
}

export async function getCurrentBranch(): Promise<string | null> {
	const uri = getGitURI();
	if (!uri) {
		return null;
	}
	const { stdout, success } = await tryExecAsync(
		'git rev-parse --abbrev-ref HEAD',
		{
			cwd: uri,
		}
	);

	if (!success) {
		void window.showErrorMessage(
			'Failed to get current git branch, please see log for more details'
		);
		return null;
	}

	return stdout.trim();
}
