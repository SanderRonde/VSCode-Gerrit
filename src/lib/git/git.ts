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
} from 'vscode';
import { ChangeTreeView } from '../../views/activityBar/changes/changeTreeView';
import { API, GitExtension } from '../../types/vscode-extension-git';
import { getLastCommits, GitCommit, tryExecAsync } from './gitCLI';
import { PERIODICAL_GIT_FETCH_INTERVAL } from '../util/constants';
import { createAwaitingInterval } from '../util/util';
import { getConfiguration } from '../vscode/config';
import { VersionNumber } from '../util/version';
import { getCurrentChangeID } from './commit';
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

export async function ensureCleanWorkingTree(): Promise<boolean> {
	{
		const { success } = await tryExecAsync(
			'git diff --ignore-submodules --quiet'
		);
		if (!success) {
			void window.showErrorMessage(
				'You have unstaged changes. Please commit or stash them and try again'
			);
			return false;
		}
	}

	{
		const { success } = await tryExecAsync(
			'git diff --cached --ignore-submodules --quiet'
		);
		if (!success) {
			void window.showErrorMessage(
				'You have uncommitted changes. Please commit or stash them and try again'
			);
			return false;
		}
	}

	return true;
}

export async function ensureMainBranchUpdated(
	gitReviewFile: GitReviewFile
): Promise<string | false> {
	const remote =
		gitReviewFile.remote ??
		gitReviewFile.defaultremote ??
		DEFAULT_GIT_REVIEW_FILE.remote;

	{
		const { success } = await tryExecAsync(`git remote update ${remote}`);
		if (!success) {
			void window.showErrorMessage(
				'Failed to update remote, please check the log panel for details.'
			);
			return false;
		}
	}

	return remote;
}

export async function getGitVersion(): Promise<VersionNumber | null> {
	const gitVersion = await (async (): Promise<VersionNumber | null> => {
		const { stdout, success } = await tryExecAsync('git version');
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

	if (!gitReviewFile || !(await ensureCleanWorkingTree())) {
		return false;
	}

	const gitVersion = await getGitVersion();
	if (!gitVersion) {
		return false;
	}

	{
		const rebaseFlag = gitVersion.isGreaterThanOrEqual(
			new VersionNumber(2, 18, 0)
		)
			? '--rebase-merges'
			: '--preserve-merges';
		const remoteBranch =
			gitReviewFile.branch ??
			gitReviewFile.defaultbranch ??
			DEFAULT_GIT_REVIEW_FILE.branch;
		const rebaseCommand = `git rebase ${rebaseFlag} ${remoteBranch}`;
		const { success } = await tryExecAsync(rebaseCommand);
		if (!success) {
			const { success: abortSuccess } = await tryExecAsync(
				'git rebase --abort'
			);
			if (!abortSuccess) {
				void window.showErrorMessage(
					'Rebase failed and abortion of rebase failed, please check the log panel for details.'
				);
				return false;
			}

			const OPEN_IN_TERMINAL_OPTION = 'Rebase in Terminal';
			const RUN_GIT_REVIEW_OPTION = 'Run Git Review';
			void (async () => {
				const answer = await window.showErrorMessage(
					'Failed to rebase, please check the log panel for details.',
					OPEN_IN_TERMINAL_OPTION,
					RUN_GIT_REVIEW_OPTION
				);
				if (answer === OPEN_IN_TERMINAL_OPTION) {
					const terminal = window.createTerminal('Gerrit Rebase');
					terminal.show(false);
					terminal.sendText(rebaseCommand, true);
				} else if (answer === RUN_GIT_REVIEW_OPTION) {
					const terminal = window.createTerminal('Git Review');
					terminal.show(false);
					terminal.sendText('git review', true);
				}
			})();

			return false;
		}
	}

	return true;
}

function getGitURI(): string | null {
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

export async function gitCheckoutRemote(patchNumber: number): Promise<void> {
	const uri = getGitURI();
	if (!uri || !(await ensureCleanWorkingTree())) {
		return;
	}

	const { success, stdout } = await tryExecAsync(
		`git-review -d ${String(patchNumber)}`,
		{
			cwd: uri,
			timeout: 10000,
		}
	);

	if (success) {
		void window.showInformationMessage(stdout);
	} else {
		void window.showErrorMessage(
			'Checkout failed. Please see log for more details'
		);
	}
}

const URL_REGEX = /http(s)?[:\w./+]+/g;
export async function gitReview(): Promise<void> {
	const uri = getGitURI();
	if (!uri) {
		return;
	}

	if (!(await ensureNoRebaseErrors())) {
		return;
	}

	const { success, stdout } = await tryExecAsync('git-review', {
		cwd: uri,
		timeout: 10000,
	});

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
	} else {
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
