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
import {
	execAndMonitor,
	getLastCommits,
	GitCommit,
	tryExecAsync,
} from './gitCLI';
import { ChangeTreeView } from '../../views/activityBar/changes/changeTreeView';
import { APISubscriptionManager } from '../subscriptions/subscriptions';
import { ReviewWebviewProvider } from '../../views/activityBar/review';
import { PERIODICAL_GIT_FETCH_INTERVAL } from '../util/constants';
import { MATCH_ANY } from '../subscriptions/baseSubscriptions';
import { createAwaitingInterval } from '../util/util';
import { getConfiguration } from '../vscode/config';
import { getCurrentChangeForRepo } from './commit';
import { VersionNumber } from '../util/version';
import { Data } from '../util/data';
import { log } from '../util/log';
import { rebase } from './rebase';

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
				const { success } = await tryExecAsync('git add .', {
					cwd: gitURI,
				});
				if (!success) {
					void window.showErrorMessage(
						'Failed to add all changes, see log for details'
					);
					return false;
				}
				const { success: commitSuccess } = await tryExecAsync(
					'git commit -C HEAD --amend',
					{
						cwd: gitURI,
					}
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
			{
				cwd: gitURI,
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

async function ensureNoRebaseErrors(gerritRepo: GerritRepo): Promise<boolean> {
	const gitReviewFile = await getGitReviewFile(gerritRepo);
	if (
		!gitReviewFile ||
		!(await ensureCleanWorkingTree(gerritRepo.rootPath))
	) {
		return false;
	}

	const gitVersion = await getGitVersion(gerritRepo.rootPath);
	if (!gitVersion) {
		return false;
	}

	return rebase(gerritRepo.rootPath, {
		title: 'Run Git Review',
		callback: () => {
			const terminal = window.createTerminal('Git Review');
			terminal.show(false);
			terminal.sendText('git review', true);
		},
	});
}

export function getChangeIDFromCheckoutString(
	changeID: string | number
): string {
	if (typeof changeID === 'number') {
		return String(changeID);
	}
	if (changeID.indexOf('~') === 0) {
		return changeID;
	}
	const [, idFromPair, idFromTriplet] = changeID.split('~');
	return idFromTriplet ?? idFromPair;
}

export async function gitCheckoutRemote(
	gerritRepo: GerritRepo,
	patchNumberOrChangeID: number | string,
	patchSet: number | undefined = undefined,
	silent: boolean = false
): Promise<boolean> {
	const uri = gerritRepo.rootPath;
	if (!(await ensureCleanWorkingTree(uri, silent))) {
		return false;
	}

	let changeString =
		getChangeIDFromCheckoutString(patchNumberOrChangeID) ??
		patchNumberOrChangeID;
	if (patchSet) {
		changeString += `/${patchSet}`;
	}
	const { success } = await tryExecAsync(`git-review -d "${changeString}"`, {
		cwd: uri,
		timeout: 10000,
	});

	if (!success) {
		void window.showErrorMessage(
			'Checkout failed. Please see log for more details'
		);
	}
	return success;
}

const URL_REGEX = /http(s)?[:\w./+]+/g;
export async function gitReview(
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
				message: 'Ensuring no rebase errors',
				increment: 10,
			});
			const uri = gerritRepo.rootPath;
			if (!(await ensureNoRebaseErrors(gerritRepo))) {
				return {
					success: false,
					handled: true,
					stdout: '',
				};
			}
			progress.report({
				increment: 40,
			});

			progress.report({
				message: 'Pushing for review',
			});
			const result = await new Promise<{
				success: boolean;
				stdout: string;
				handled: boolean;
			}>((resolve) => {
				let ignoreInitialResult = false;
				void execAndMonitor(
					'git-review',
					async (stdout, proc) => {
						if (
							!stdout.includes(
								'You are about to submit multiple commits.'
							)
						) {
							return;
						}

						ignoreInitialResult = true;
						proc.kill();
						const YES_OPTION = 'Yes';
						const CANCEL_OPTION = 'Cancel';
						const choice = await window.showInformationMessage(
							'You are about to submit multiple commits, are you sure?',
							YES_OPTION,
							CANCEL_OPTION
						);

						if (choice === YES_OPTION) {
							const result = await tryExecAsync('git-review -y', {
								cwd: uri,
								timeout: 10000,
							});
							resolve({
								success: result.success,
								stdout: result.stdout,
								handled: true,
							});
						} else if (choice === CANCEL_OPTION || !choice) {
							resolve({
								success: false,
								stdout: '',
								handled: true,
							});
						}
					},
					{
						cwd: uri,
						timeout: 10000,
					}
				).then(({ success, stdout }) => {
					if (success && !ignoreInitialResult) {
						resolve({
							success: true,
							handled: true,
							stdout,
						});
					}
				});
			});
			progress.report({
				increment: 50,
			});

			return result;
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
			'Git review failed, please see log for more details'
		);
	}
}

export async function getCurrentBranch(
	gerritRepo: GerritRepo
): Promise<string | null> {
	const uri = gerritRepo.rootPath;
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
