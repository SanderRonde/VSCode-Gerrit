import {
	ensureCleanWorkingTree,
	ensureMainBranchUpdated,
	getChangeIDFromCheckoutString,
	getCurrentBranch,
	getGitVersion,
} from './git';
import { getChangeID, getCurrentChangeForRepo, isGerritCommit } from './commit';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { getGitReviewFile } from '../credentials/gitReviewFile';
import { GerritChangeStatus } from '../gerrit/gerritAPI/types';
import { getLastCommits, tryExecAsync } from './gitCLI';
import { getAPIForRepo } from '../gerrit/gerritAPI';
import { GerritRepo } from '../gerrit/gerritRepo';
import { ProgressLocation, window } from 'vscode';
import { Data } from '../util/data';

async function buildDependencyTree(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	maxCommits: number = 10
): Promise<
	| {
			change: GerritChange;
			onto: GerritChange | null;
	  }[]
	| null
> {
	if (maxCommits >= 100) {
		void window.showErrorMessage(
			'Dependency tree went too deep (>100 commits), aborting'
		);
		return null;
	}

	const commits = await getLastCommits(gerritRepo, maxCommits);

	if (!commits.every((c) => isGerritCommit(c))) {
		void window.showInformationMessage(
			'Found a non-gerrit commit in history, aborting'
		);
		return null;
	}

	const api = await getAPIForRepo(gerritReposD, gerritRepo);
	if (!api) {
		void window.showInformationMessage('No Gerrit API found, aborting');
		return null;
	}

	const changes: GerritChange[] = [];
	for (const commit of commits) {
		const changeID = getChangeID(commit)!;
		const change = await api.getChange(changeID, null).fetchOnce();
		if (!change) {
			void window.showErrorMessage(
				`Failed to fetch change ${changeID}, aborting`
			);
			return null;
		}
		if (change.status === GerritChangeStatus.ABANDONED) {
			void window.showInformationMessage(
				`Found abandoned change ${change.number} aborting`
			);
			return null;
		}
		if (change.status === GerritChangeStatus.MERGED) {
			break;
		}

		changes.push(change);
	}
	if (commits.length === maxCommits) {
		return await buildDependencyTree(
			gerritReposD,
			gerritRepo,
			maxCommits + 10
		);
	}

	const operations: {
		change: GerritChange;
		onto: GerritChange | null;
	}[] = [];
	for (let i = changes.length - 1; i >= 0; i--) {
		operations.push({
			change: changes[i],
			onto: changes[i + 1] || null,
		});
	}

	return operations;
}

export async function rebase(
	uri: string,
	...extraOptions: {
		title: string;
		callback: () => void | Promise<void>;
	}[]
): Promise<boolean> {
	const rebaseCommand = 'git pull --rebase';
	const { success } = await tryExecAsync(rebaseCommand, {
		cwd: uri,
	});
	if (!success) {
		const { success: abortSuccess } = await tryExecAsync(
			'git rebase --abort',
			{
				cwd: uri,
			}
		);
		if (!abortSuccess) {
			void window.showErrorMessage(
				'Rebase failed and aborting of rebase failed, please check the log panel for details.'
			);
			return false;
		}

		const OPEN_IN_TERMINAL_OPTION = 'Rebase in Terminal';
		void (async () => {
			const answer = await window.showErrorMessage(
				'Failed to rebase, please check the log panel for details.',
				OPEN_IN_TERMINAL_OPTION,
				...extraOptions.map((e) => e.title)
			);
			if (answer === OPEN_IN_TERMINAL_OPTION) {
				const terminal = window.createTerminal('Gerrit Rebase');
				terminal.show(false);
				terminal.sendText(rebaseCommand, true);
			} else {
				const match = extraOptions.find((e) => e.title === answer);
				if (match) {
					await match.callback();
				}
			}
		})();

		return false;
	}

	return true;
}

export async function rebaseOntoParent(gerritRepo: GerritRepo): Promise<void> {
	await window.withProgress(
		{
			location: ProgressLocation.Notification,
			cancellable: true,
			title: 'Rebasing onto main',
		},
		async (progress, token) => {
			progress.report({
				message: 'Ensuring working tree is clean',
				increment: 0,
			});
			// Check for clean working tree
			if (
				!(await ensureCleanWorkingTree(gerritRepo.rootPath)) ||
				token.isCancellationRequested
			) {
				return;
			}

			progress.report({
				message: 'Getting git review file',
				increment: 20,
			});
			const gitReviewFile = await getGitReviewFile(gerritRepo);
			if (!gitReviewFile || token.isCancellationRequested) {
				return;
			}

			progress.report({
				message: 'Rebasing',
				increment: 20,
			});
			if (!(await rebase(gerritRepo.rootPath))) {
				return;
			}

			progress.report({
				message: 'Rebased onto parent branch',
				increment: 60,
			});
		}
	);
}

export async function recursiveRebase(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo
): Promise<void> {
	await window.withProgress(
		{
			location: ProgressLocation.Notification,
			cancellable: true,
			title: 'Rebasing onto main',
		},
		async (progress, token) => {
			let lastProgress: number = 0;
			const getRelativeProgress = (total: number): number => {
				const value = total - lastProgress;
				lastProgress = total;
				return value;
			};

			progress.report({
				message: 'Ensuring working tree is clean',
				increment: 0,
			});
			// Check for clean working tree
			if (
				!(await ensureCleanWorkingTree(gerritRepo.rootPath)) ||
				token.isCancellationRequested
			) {
				return;
			}

			progress.report({
				message: 'Getting git review file',
				increment: getRelativeProgress(2.5),
			});
			const gitReviewFile = await getGitReviewFile(gerritRepo);
			if (!gitReviewFile || token.isCancellationRequested) {
				return;
			}

			progress.report({
				message: 'Getting git version',
				increment: getRelativeProgress(5),
			});
			const gitVersion = await getGitVersion(gerritRepo.rootPath);
			if (!gitVersion || token.isCancellationRequested) {
				return;
			}

			progress.report({
				message: 'Updating main branch',
				increment: getRelativeProgress(7.5),
			});
			const remoteBranch = await ensureMainBranchUpdated(
				gerritRepo.rootPath,
				gitReviewFile
			);
			if (!remoteBranch || token.isCancellationRequested) {
				return;
			}

			progress.report({
				message: 'Ensuring current change has not been merged',
				increment: getRelativeProgress(10),
			});
			const currentChangeID = await getCurrentChangeForRepo(gerritRepo);
			const currentChange =
				currentChangeID &&
				(await (await getAPIForRepo(gerritReposD, gerritRepo))
					?.getChange(currentChangeID.changeID, null)
					.fetchOnce());
			if (token.isCancellationRequested) {
				return;
			}
			if (!currentChange) {
				void window.showErrorMessage('Failed to find current change');
				return;
			}
			if (currentChange.status !== GerritChangeStatus.NEW) {
				void window.showErrorMessage(
					'Current change is abandoned or merged'
				);
				return;
			}

			progress.report({
				message: 'Getting current branch',
				increment: getRelativeProgress(12.5),
			});
			const initialBranch = await getCurrentBranch(gerritRepo);
			if (!initialBranch) {
				void window.showErrorMessage(
					'Failed to get current branch, aborting'
				);
				return;
			}

			progress.report({
				message: 'Building dependency tree',
				increment: getRelativeProgress(15),
			});
			const dependencyTree = await buildDependencyTree(
				gerritReposD,
				gerritRepo
			);
			if (!dependencyTree || token.isCancellationRequested) {
				return;
			}

			const cancel = async (message: string): Promise<void> => {
				const CHECKOUT_ORIGINAL_OPTION = 'Checkout original branch';
				const answer = await window.showErrorMessage(
					message,
					CHECKOUT_ORIGINAL_OPTION
				);
				if (answer === CHECKOUT_ORIGINAL_OPTION) {
					if (
						!(await tryExecAsync(`git checkout ${initialBranch}`, {
							cwd: gerritRepo.rootPath,
						}))
					) {
						void window.showErrorMessage(
							'Failed to checkout original branch'
						);
					}
				}
			};

			const numOperations = dependencyTree.length + 1;
			const progressPerOperation = 80 / numOperations;
			let currentProgress = 20;
			for (let i = 0; i < dependencyTree.length; i++) {
				const operation = dependencyTree[i];
				progress.report({
					message: `Rebasing ${operation.change.number} onto ${
						operation.onto?.number ?? 'Main Branch'
					}`,
					increment: getRelativeProgress(currentProgress),
				});

				// Checkout branch
				const { success } = await tryExecAsync(
					`git-review -d "${getChangeIDFromCheckoutString(
						operation.change.number
					)}"`,
					{
						cwd: gerritRepo.rootPath,
					}
				);
				if (token.isCancellationRequested) {
					return;
				}
				if (!success) {
					await cancel(
						`Failed to download change ${operation.change.number}, aborting`
					);
				}

				if (
					!(await rebase(gerritRepo.rootPath, {
						title: 'Back to original branch',
						callback: async () => {
							if (
								!(await tryExecAsync(
									`git checkout ${initialBranch}`,
									{
										cwd: gerritRepo.rootPath,
									}
								))
							) {
								void window.showErrorMessage(
									'Failed to checkout original branch'
								);
							}
						},
					})) ||
					token.isCancellationRequested
				) {
					return;
				}
				currentProgress += progressPerOperation;
			}

			progress.report({
				message: `Rebasing ${
					dependencyTree.length === 0
						? currentChange.number
						: dependencyTree[dependencyTree.length - 1].change
								.number
				} onto ${remoteBranch}`,
				increment: currentProgress,
			});
			currentProgress += progressPerOperation;

			if (
				!(await rebase(gerritRepo.rootPath, {
					title: 'Back to original branch',
					callback: async () => {
						if (
							!(await tryExecAsync(
								`git checkout ${initialBranch}`,
								{
									cwd: gerritRepo.rootPath,
								}
							))
						) {
							void window.showErrorMessage(
								'Failed to checkout original branch'
							);
						}
					},
				})) ||
				token.isCancellationRequested
			) {
				return;
			}

			progress.report({
				message: 'Succesfully rebased recursively',
				increment: getRelativeProgress(currentProgress),
			});
		}
	);
}
