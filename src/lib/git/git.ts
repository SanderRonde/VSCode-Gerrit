import {
	DEFAULT_GIT_REVIEW_FILE,
	getGitReviewFileCached,
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

async function ensureCleanWorkingTree(): Promise<boolean> {
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

async function ensureNoRebaseErrors(): Promise<boolean> {
	const gitReviewFile = await getGitReviewFileCached();
	if (!gitReviewFile) {
		return true;
	}

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

	if (!(await ensureCleanWorkingTree())) {
		return false;
	}

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
		const { success } = await tryExecAsync(
			`git rebase ${rebaseFlag} ${remoteBranch}`
		);
		if (!success) {
			void window.showErrorMessage(
				'Failed to rebase, please check the log panel for details.'
			);

			const { success: abortSuccess } = await tryExecAsync(
				'git rebase --abort'
			);
			if (!abortSuccess) {
				void window.showErrorMessage(
					'Failed to abort rebase, please check the log panel for details.'
				);
			}

			return false;
		}
	}

	return true;
}

export async function gitCheckoutRemote(patchNumber: number): Promise<void> {
	const api = getGitAPI();
	if (!api || !api.repositories.length) {
		void window.showErrorMessage('Multi-git-repo setups are not supported');
		return;
	}

	const uri = api.repositories[0].rootUri.fsPath;
	if (!(await ensureCleanWorkingTree())) {
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
	const api = getGitAPI();
	if (!api || !api.repositories.length) {
		void window.showErrorMessage('Multi-git-repo setups are not supported');
		return;
	}

	const uri = api.repositories[0].rootUri.fsPath;

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
