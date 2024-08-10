import {
	ExtensionContext,
	window,
	StatusBarAlignment,
	StatusBarItem,
	Disposable,
	QuickPickItem,
} from 'vscode';
import {
	getRemote,
	gitCheckoutRemote,
	onChangeLastCommit,
} from '../../lib/git/git';
import {
	DefaultChangeFilter,
	filterOr,
} from '../../lib/gerrit/gerritAPI/filters';

import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { getGitReviewFile } from '../../lib/credentials/gitReviewFile';
import { GerritExtensionCommands } from '../../commands/command-names';
import { isGerritCommit, getChangeID } from '../../lib/git/commit';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { GitCommit, tryExecAsync } from '../../lib/git/gitCLI';
import { getAPIForRepo } from '../../lib/gerrit/gerritAPI';
import { GerritRepo } from '../../lib/gerrit/gerritRepo';
import { Data } from '../../lib/util/data';
import { wait } from '../../lib/util/util';

export async function getMainBranchName(
	gerritRepo: GerritRepo
): Promise<string> {
	const remote = getRemote(await getGitReviewFile(gerritRepo));
	const cmd = await tryExecAsync(
		`git symbolic-ref refs/remotes/${remote}/HEAD | sed 's@^refs/remotes/${remote}/@@'`,
		gerritRepo.rootPath,
		{
			timeout: 2000,
		}
	);
	if (cmd.success && cmd.stdout) {
		return cmd.stdout;
	}
	return 'master';
}

type ChangeQuickPickItem = QuickPickItem &
	(
		| {
				change: GerritChange;
				type: 'change';
				repo: GerritRepo;
		  }
		| {
				branchName: string;
				type: 'branch';
				repo: GerritRepo;
		  }
	);

export async function selectChange(
	gerritReposD: Data<GerritRepo[]>,
	includeMaster?: false
): Promise<null | {
	type: 'changeId';
	changeId: number;
	repo: GerritRepo;
}>;
export async function selectChange(
	gerritReposD: Data<GerritRepo[]>,
	includeMaster: true
): Promise<
	| null
	| {
			type: 'changeId';
			changeId: number;
			repo: GerritRepo;
	  }
	| {
			type: 'branchName';
			branchName: string;
			repo: GerritRepo;
	  }
>;
export async function selectChange(
	gerritReposD: Data<GerritRepo[]>,
	includeMaster: boolean = false
): Promise<
	| null
	| {
			type: 'changeId';
			changeId: number;
			repo: GerritRepo;
	  }
	| {
			type: 'branchName';
			branchName: string;
			repo: GerritRepo;
	  }
> {
	// Get a list of changes
	const changesForRepos: Map<GerritRepo, GerritChange[]> = new Map();
	for (const repo of gerritReposD.get()) {
		const api = await getAPIForRepo(gerritReposD, repo);
		if (!api) {
			continue;
		}
		changesForRepos.set(
			repo,
			await api
				.getChanges(
					[
						[
							DefaultChangeFilter.IS_OPEN,
							filterOr(
								DefaultChangeFilter.HAS_DRAFT,
								DefaultChangeFilter.ATTENTION_SELF,
								DefaultChangeFilter.OWNER_SELF,
								DefaultChangeFilter.CC_SELF,
								DefaultChangeFilter.REVIEWER_SELF
							),
						],
					],
					{
						count: 500,
					},
					undefined,
					GerritAPIWith.DETAILED_ACCOUNTS
				)
				.getValue(true)
		);
	}

	if (changesForRepos.size === 0) {
		void window.showErrorMessage('Failed to connect to Gerrit API');
		return null;
	}

	const quickPick = window.createQuickPick<ChangeQuickPickItem>();
	const itemPromises: Promise<ChangeQuickPickItem>[] = [];
	for (const [repo, changes] of changesForRepos) {
		for (const change of changes) {
			itemPromises.push(
				(async () => {
					const authorName = (
						await change.detailedOwner()
					)?.getName();
					return {
						label: change.subject,
						description: `${authorName ? `by ${authorName} - ` : ''}${
							change.number
						}`,
						detail: change.changeID,
						change,
						type: 'change',
						repo,
					};
				})()
			);
		}
	}

	const items = await Promise.all(itemPromises);
	if (includeMaster) {
		for (const gerritRepo of gerritReposD.get()) {
			const mainBranchName = await getMainBranchName(gerritRepo);
			let label = mainBranchName;
			if (gerritReposD.get().length > 1) {
				const gitReviewFile = await getGitReviewFile(gerritRepo);
				if (gitReviewFile?.project) {
					label = `${gitReviewFile.project} - ${mainBranchName}`;
				}
			}
			items.push({
				label: label,
				description: 'Main branch',
				detail: mainBranchName,
				type: 'branch',
				branchName: mainBranchName,
				repo: gerritRepo,
			});
		}
	}
	quickPick.items = items;

	const disposables: Disposable[] = [];
	quickPick.matchOnDescription = true;
	quickPick.matchOnDetail = true;
	disposables.push(
		quickPick.onDidHide(() => {
			disposables.forEach((d) => void d.dispose());
		})
	);

	return new Promise<
		| null
		| {
				type: 'changeId';
				changeId: number;
				repo: GerritRepo;
		  }
		| {
				type: 'branchName';
				branchName: string;
				repo: GerritRepo;
		  }
	>((resolve) => {
		disposables.push(
			quickPick.onDidHide(() => {
				resolve(null);
			})
		);
		disposables.push(
			quickPick.onDidAccept(() => {
				const selectedItem = quickPick.selectedItems[0] as
					| ChangeQuickPickItem
					| undefined;
				if (selectedItem?.type === 'branch') {
					quickPick.hide();
					resolve({
						type: 'branchName',
						branchName: selectedItem.branchName,
						repo: selectedItem.repo,
					});
				} else if (selectedItem?.type === 'change') {
					quickPick.hide();
					resolve({
						type: 'changeId',
						changeId: selectedItem.change.number,
						repo: selectedItem.repo,
					});
				} else if (quickPick.value && /^\d+$/.test(quickPick.value)) {
					if (gerritReposD.get().length > 1) {
						void window.showErrorMessage(
							'Checking out a change by number is only supported when there is a single gerrit repo'
						);
						return;
					}

					quickPick.hide();
					resolve({
						type: 'changeId',
						repo: gerritReposD.get()[0],
						changeId: parseInt(quickPick.value, 10),
					});
				} else {
					void window.showErrorMessage(
						`Invalid change label/number for change: ${quickPick.value}`
					);
				}
			})
		);
		quickPick.show();
	});
}

export async function openChangeSelector(
	gerritReposD: Data<GerritRepo[]>,
	statusBar: CurrentChangeStatusBarManager
): Promise<void> {
	statusBar.setOverride({
		text: '$(list-unordered) Picking change...',
		tooltip: 'Picking change to check out',
	});
	const change = await selectChange(gerritReposD, true);
	if (!change) {
		statusBar.setOverride(null);
		return;
	}
	let success = true;
	if (change.type === 'changeId') {
		statusBar.setOverride({
			text: `$(loading~spin) Checking out #${change.changeId}`,
			tooltip: `Checking out change #${change.changeId}`,
		});
		success = await gitCheckoutRemote(
			gerritReposD,
			change.repo,
			change.changeId
		);
	} else {
		statusBar.setOverride({
			text: `$(loading~spin) Checking out ${change.branchName}`,
			tooltip: `Checking out branch ${change.branchName}`,
		});
		success = await gitCheckoutBranch(change.repo, change.branchName);
	}

	if (!success) {
		statusBar.setOverride({
			text: 'Checkout failed',
			tooltip: 'Checkout failed',
		});
		await wait(3000);
	}

	statusBar.setOverride(null);
}

async function gitCheckoutBranch(
	gerritRepo: GerritRepo,
	branchName: string
): Promise<boolean> {
	const { success } = await tryExecAsync(
		`git checkout ${branchName}`,
		gerritRepo.rootPath,
		{
			timeout: 10000,
		}
	);

	if (!success) {
		void window.showErrorMessage(
			'Checkout failed. Please see log for more details'
		);
	}
	return success;
}

export function showCurrentChangeStatusBarIcon(
	gerritReposD: Data<GerritRepo[]>,
	currentChangeStatusBar: CurrentChangeStatusBarManager,
	context: ExtensionContext
): void {
	context.subscriptions.push(
		onChangeLastCommit(gerritReposD, async (gerritRepo, lastCommit) => {
			await currentChangeStatusBar.onCommitUpdate(
				gerritReposD,
				gerritRepo,
				lastCommit
			);
		})
	);
}

export class CurrentChangeStatusBarManager implements Disposable {
	private _instance: StatusBarItem = (() => {
		const statusBar = window.createStatusBarItem(StatusBarAlignment.Left);
		statusBar.command = GerritExtensionCommands.OPEN_CHANGE_SELECTOR;
		return statusBar;
	})();
	private _contents: { text: string; tooltip: string } | null = null;
	private _override: { text: string; tooltip: string } | null = null;

	public constructor() {}

	private _show(text: string, tooltip: string): void {
		this._contents = {
			text,
			tooltip,
		};
		if (this._override) {
			this._instance.text = this._override.text;
			this._instance.tooltip = this._override.tooltip;
		} else {
			this._instance.text = text;
			this._instance.tooltip = tooltip;
		}
		this._instance.show();
	}

	public setOverride(
		override: { text: string; tooltip: string } | null
	): void {
		this._override = override;
		if (this._contents) {
			// Restore/apply
			this._show(this._contents.text, this._contents.tooltip);
		}
	}

	private _lastConfig: {
		gerritRepo: GerritRepo;
		lastCommit: GitCommit;
	} | null = null;
	public async onCommitUpdate(
		gerritReposD: Data<GerritRepo[]>,
		gerritRepo: GerritRepo,
		lastCommit: GitCommit
	): Promise<void> {
		if (!isGerritCommit(lastCommit)) {
			return this._instance.hide();
		}

		const changeID = getChangeID(lastCommit);
		if (!changeID) {
			this._show(
				'$(git-commit) unpublished change',
				'Unpublished gerrit change, no ChangeID set'
			);
			return;
		}

		const subscription = await GerritChange.getChange(
			gerritReposD,
			{
				changeID,
				gerritRepo,
			},
			[],
			{
				allowFail: true,
			}
		);

		this._lastConfig = {
			gerritRepo,
			lastCommit,
		};
		subscription.subscribeOnce(
			new WeakRef(async () => {
				if (
					this._lastConfig?.gerritRepo !== gerritRepo ||
					this._lastConfig?.lastCommit !== lastCommit
				) {
					return;
				}
				await this.onCommitUpdate(gerritReposD, gerritRepo, lastCommit);
			}),
			{ onSame: true }
		);
		const change = await subscription.getValue();

		if (!change) {
			// Try again in a little while
			setTimeout(() => {
				void (async () => {
					if ((await subscription.getValue()) === null) {
						void subscription.getValue(true);
					}
				})();
			}, 30 * 1000);
			return this._instance.hide();
		}

		this._show(
			`$(git-commit) #${change.number}`,
			`#${change.number}: ${change.subject}\nClick to list changes for checkout`
		);
	}

	public dispose(): void {
		this._instance.dispose();
	}
}
