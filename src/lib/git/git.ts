import {
	GerritRepo,
	getCurrentGerritRepo,
	onChangeCurrentRepo,
	setListenerForRepos,
} from '../gerrit/gerritRepo';
import {
	DEFAULT_GIT_REVIEW_FILE,
	getGitReviewFile,
	GitReviewFile,
} from '../credentials/gitReviewFile';
import {
	window,
	Disposable,
	Uri,
	env,
	ConfigurationTarget,
	ProgressLocation,
} from 'vscode';
import { getMainBranchName } from '../../views/statusBar/currentChangeStatusBar';
import { ChangeTreeView } from '../../views/activityBar/changes/changeTreeView';
import { APISubscriptionManager } from '../subscriptions/subscriptions';
import { ReviewWebviewProvider } from '../../views/activityBar/review';
import { filterNumberOrChangeID } from '../gerrit/gerritAPI/filters';
import { GerritRevision } from '../gerrit/gerritAPI/gerritRevision';
import { getLastCommits, GitCommit, tryExecAsync } from './gitCLI';
import { PERIODICAL_GIT_FETCH_INTERVAL } from '../util/constants';
import { MATCH_ANY } from '../subscriptions/baseSubscriptions';
import { GerritAPIWith } from '../gerrit/gerritAPI/api';
import { createAwaitingInterval } from '../util/util';
import { getAPIForRepo } from '../gerrit/gerritAPI';
import { getConfiguration } from '../vscode/config';
import { getCurrentChangeForRepo } from './commit';
import { VersionNumber } from '../util/version';
import { Data } from '../util/data';
import { log } from '../util/log';

export async function onChangeLastCommitForRepo(
	gerritRepo: GerritRepo,
	handler: (lastCommit: GitCommit) => void | Promise<void>,
	callInitial = false
): Promise<Disposable> {
	let currentLastCommit = (await getLastCommits(gerritRepo, 1))[0];
	if (callInitial && currentLastCommit) {
		await handler(currentLastCommit);
	}
	const interval = createAwaitingInterval(async () => {
		const newLastCommit = (await getLastCommits(gerritRepo, 1))[0];
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

export function onChangeLastCommit(
	gerritReposD: Data<GerritRepo[]>,
	handler: (
		gerritRepo: GerritRepo,
		lastCommit: GitCommit
	) => void | Promise<void>
): Disposable {
	let currentRepo = getCurrentGerritRepo(gerritReposD.get(), 'silent');
	const lastCommits = new Map<GerritRepo, GitCommit>();

	const subscriptions = new Set<Disposable>();
	subscriptions.add(
		onChangeCurrentRepo(gerritReposD, async (repo) => {
			currentRepo = repo;
			const lastCommit = lastCommits.get(repo);
			if (lastCommit) {
				await handler(repo, lastCommit);
			}
		})
	);

	setListenerForRepos(
		gerritReposD,
		async (gerritRepo) => {
			const disposable = await onChangeLastCommitForRepo(
				gerritRepo,
				async (lastCommit) => {
					lastCommits.set(gerritRepo, lastCommit);
					if (gerritRepo === currentRepo) {
						await handler(gerritRepo, lastCommit);
					}
				},
				true
			);
			subscriptions.add(disposable);
			return disposable;
		},
		(_, disposable) => {
			if (disposable) {
				disposable.dispose();
				subscriptions.delete(disposable);
			}
		}
	);
	return {
		dispose: () => {
			subscriptions.forEach((s) => void s.dispose());
		},
	};
}

export async function createStash(
	uri: string,
	stashName: string
): Promise<boolean> {
	if (
		!(await tryExecAsync(`git stash push -u -m "${stashName}"`, uri))
			.success
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
		uri
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

	const { success } = await tryExecAsync(`git stash drop "${stash}"`, uri);
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
			gitURI,
			{
				silent: true,
			}
		);
		if (!success) {
			if (silent) {
				return false;
			}
			const choice = await window.showWarningMessage(
				'You have unstaged changes. Please commit or stash them',
				{
					title: 'Amend all changes' as const,
				},
				{
					title: 'Stash changes' as const,
				}
			);
			if (!choice) {
				return false;
			}
			if (choice.title === 'Stash changes') {
				const stashName = await window.showInputBox({
					value: 'gerrit-stash',
					title: 'Stash name',
				});
				if (!stashName) {
					return false;
				}
				if (!(await createStash(gitURI, stashName))) {
					return false;
				}
			}
			if (choice.title === 'Amend all changes') {
				const { success } = await tryExecAsync('git add .', gitURI);
				if (!success) {
					void window.showErrorMessage(
						'Failed to add all changes, see log for details'
					);
					return false;
				}
				const { success: commitSuccess } = await tryExecAsync(
					'git commit -C HEAD --amend',
					gitURI
				);
				if (!commitSuccess) {
					void window.showErrorMessage(
						'Failed to amend changes, see log for details'
					);
					return false;
				}
			}
			return true;
		}
	}

	{
		const { success } = await tryExecAsync(
			'git diff --cached --ignore-submodules --quiet',
			gitURI,
			{
				silent: true,
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

export async function getRemote(
	uri: string,
	gitReviewFile: GitReviewFile | null
): Promise<string> {
	const remoteOptions = [];
	if (gitReviewFile?.remote) {
		remoteOptions.push(gitReviewFile.remote);
	}
	if (gitReviewFile?.defaultremote) {
		remoteOptions.push(gitReviewFile.defaultremote);
	}
	remoteOptions.push(DEFAULT_GIT_REVIEW_FILE.remote);
	remoteOptions.push('origin');

	const { success, stdout } = await tryExecAsync('git remote', uri);
	if (success) {
		const remotes = stdout.trim().split('\n');
		for (const remote of remoteOptions) {
			if (remotes.includes(remote)) {
				return remote;
			}
		}
		return remotes[0];
	}
	return remoteOptions[0];
}

export async function ensureMainBranchUpdated(
	uri: string,
	gitReviewFile: GitReviewFile | null
): Promise<string | false> {
	const remote = await getRemote(uri, gitReviewFile);
	{
		const { success } = await tryExecAsync(
			`git remote update ${remote}`,
			uri
		);
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
		const { stdout, success } = await tryExecAsync('git version', uri);
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

export async function getMainBranch(
	gerritRepo: GerritRepo,
	gitReviewFile: GitReviewFile | null
): Promise<string> {
	return gitReviewFile
		? gitReviewFile.branch ??
				gitReviewFile.defaultbranch ??
				DEFAULT_GIT_REVIEW_FILE.branch
		: await getMainBranchName(gerritRepo);
}

export async function gitCheckoutRemote(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	patchNumberOrChangeID: number | string,
	patchSet: number | undefined = undefined,
	silent: boolean = false
): Promise<boolean> {
	const uri = gerritRepo.rootPath;
	if (!(await ensureCleanWorkingTree(uri, silent))) {
		return false;
	}

	return await checkoutChangeID(
		gerritReposD,
		gerritRepo,
		patchNumberOrChangeID,
		patchSet
	);
}

const URL_REGEX = /http(s)?[:\w./+]+/g;
export async function pushForReview(
	gerritRepo: GerritRepo,
	reviewWebviewProvider: ReviewWebviewProvider
): Promise<void> {
	const config = getConfiguration();
	const showProgressInNotification = config.get(
		'gerrit.messages.postReviewNotification',
		true
	);
	const { success, stdout, handled } = await window.withProgress<{
		success: boolean;
		stdout: string;
		handled: boolean;
	}>(
		{
			location: showProgressInNotification
				? ProgressLocation.Notification
				: ProgressLocation.SourceControl,
			title: 'Pushing for review',
		},
		async (progress) => {
			progress.report({
				message: 'Ensuring clean working directory',
				increment: 10,
			});
			const uri = gerritRepo.rootPath;

			if (!(await ensureCleanWorkingTree(gerritRepo.rootPath, false))) {
				return {
					success: false,
					handled: true,
					stdout: '',
				};
			}
			progress.report({
				increment: 20,
			});

			progress.report({
				message: 'Checking for multiple commits',
			});

			const gitReviewFile = await getGitReviewFile(gerritRepo);
			const remote = await getRemote(uri, gitReviewFile);
			const { success: gitLogSuccess, stdout: gitLogStdout } =
				await tryExecAsync(
					`git log --color=always --decorate --oneline --no-show-signature HEAD --not --remotes=${remote}`,
					uri
				);
			if (!gitLogSuccess) {
				void window.showErrorMessage(
					'Failed to execute git, please see log for more details'
				);
				return {
					success: false,
					handled: true,
					stdout: '',
				};
			}

			const queuedCommits = gitLogStdout.trim().split('\n');
			if (queuedCommits.length > 1) {
				const YES_OPTION = 'Yes';
				const CANCEL_OPTION = 'Cancel';
				const choice = await window.showInformationMessage(
					'You are about to submit multiple commits, are you sure?',
					YES_OPTION,
					CANCEL_OPTION
				);

				if (choice === CANCEL_OPTION || !choice) {
					return {
						success: false,
						stdout: '',
						handled: true,
					};
				}
			}

			progress.report({
				increment: 20,
			});

			progress.report({
				message: 'Pushing for review',
			});

			const branch = await getMainBranch(gerritRepo, gitReviewFile);
			const {
				success: pushSuccess,
				stdout: pushStdout,
				stderr: pushStderr,
			} = await tryExecAsync(
				`git push --no-follow-tags ${remote} HEAD:refs/for/${branch}`,
				gerritRepo.rootPath
			);

			progress.report({
				increment: 50,
			});

			return {
				handled: false,
				stdout: pushStdout + pushStderr,
				success: pushSuccess,
			};
		}
	);

	const change = await getCurrentChangeForRepo(gerritRepo);
	if (change) {
		await APISubscriptionManager.changeSubscriptions.invalidate({
			changeID: change.changeID,
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
				const change = await getCurrentChangeForRepo(gerritRepo);
				if (!change) {
					void window.showErrorMessage(
						'Failed to get current change ID'
					);
				} else {
					await ChangeTreeView.openInReview(
						gerritRepo,
						reviewWebviewProvider,
						change.changeID
					);
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
			'Push for review failed, please see log for more details'
		);
	}
}

export async function getCurrentBranch(
	gerritRepo: GerritRepo
): Promise<string | null> {
	const uri = gerritRepo.rootPath;
	const { stdout, success } = await tryExecAsync(
		'git rev-parse --abbrev-ref HEAD',
		uri
	);

	if (!success) {
		void window.showErrorMessage(
			'Failed to get current git branch, please see log for more details'
		);
		return null;
	}

	return stdout.trim();
}

async function checkoutRevision(
	gerritRepo: GerritRepo,
	revision: GerritRevision
): Promise<boolean> {
	const success = await (async () => {
		const fetchResult = await tryExecAsync(
			`git fetch ${await getRemote(gerritRepo.rootPath, await getGitReviewFile(gerritRepo))} ${revision.fetch.ssh.ref}`,
			gerritRepo.rootPath
		);
		if (!fetchResult.success) {
			return false;
		}

		const checkoutResult = await tryExecAsync(
			`git checkout -b change-${revision.change.number} FETCH_HEAD`,
			gerritRepo.rootPath,
			{
				timeout: 10000,
			}
		);
		if (!checkoutResult.success) {
			return false;
		}
		return true;
	})();

	if (!success) {
		void window.showErrorMessage('Failed to checkout change');
	}
	return success;
}

async function checkoutByNumbers(
	gerritRepo: GerritRepo,
	changeNumber: number,
	patchSet: number
): Promise<boolean> {
	const success = await (async () => {
		let checksumNumber = String(changeNumber).slice(-2);
		if (checksumNumber.length === 1) {
			checksumNumber = `0${checksumNumber}`;
		}
		const ref = `refs/changes/${checksumNumber}/${changeNumber}/${patchSet}`;
		const fetchResult = await tryExecAsync(
			`git fetch ${await getRemote(gerritRepo.rootPath, await getGitReviewFile(gerritRepo))} ${ref}`,
			gerritRepo.rootPath
		);
		if (!fetchResult.success) {
			return false;
		}

		const checkoutResult = await tryExecAsync(
			`git checkout -b change-${changeNumber} FETCH_HEAD`,
			gerritRepo.rootPath,
			{
				timeout: 10000,
			}
		);
		if (!checkoutResult.success) {
			return false;
		}
		return true;
	})();

	if (!success) {
		void window.showErrorMessage('Failed to checkout change');
	}
	return success;
}

export async function checkoutChangeID(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	numberOrChangeID: number | string,
	patchSet: number | undefined = undefined
): Promise<boolean> {
	const success = await (async () => {
		const api = await getAPIForRepo(gerritReposD, gerritRepo);
		if (!api) {
			return false;
		}

		const changes = await api
			.getChanges(
				[[filterNumberOrChangeID(numberOrChangeID)]],
				undefined,
				undefined,
				GerritAPIWith.CURRENT_REVISION
			)
			.fetchOnce();

		if (!changes.length) {
			return false;
		}

		const change = changes[0];
		const currentRevision = await change.getCurrentRevision();
		if (!currentRevision) {
			return false;
		}

		if (!patchSet) {
			// Check out latest
			return checkoutRevision(
				change.gerritRepo,

				currentRevision
			);
		}
		return checkoutByNumbers(change.gerritRepo, change.number, patchSet);
	})();

	if (!success) {
		void window.showErrorMessage('Failed to find change to check out');
	}
	return success;
}
