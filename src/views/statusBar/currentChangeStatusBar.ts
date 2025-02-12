import {
	ExtensionContext,
	window,
	StatusBarAlignment,
	StatusBarItem,
	Disposable,
} from 'vscode';
import {
	DefaultChangeFilter,
	filterOr,
} from '../../lib/gerrit/gerritAPI/filters';
import { gitCheckoutRemote, onChangeLastCommit } from '../../lib/git/git';

import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { GerritExtensionCommands } from '../../commands/command-names';
import { isGerritCommit, getChangeID } from '../../lib/git/commit';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { GitCommit, tryExecAsync } from '../../lib/git/gitCLI';
import { Repository } from '../../types/vscode-extension-git';
import { getAPI } from '../../lib/gerrit/gerritAPI';

async function getMainBranchName(gerritRepo: Repository): Promise<string> {
	const cmd = await tryExecAsync(
		"git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'",
		{
			cwd: gerritRepo.rootUri.fsPath,
			timeout: 2000,
		}
	);
	if (cmd.success && cmd.stdout) {
		return cmd.stdout.trim();
	}
	return 'master';
}

export async function selectChange(
	gerritRepo: Repository,
	includeMaster?: false
): Promise<null | {
	type: 'changeId';
	changeId: number;
}>;
export async function selectChange(
	gerritRepo: Repository,
	includeMaster: true
): Promise<
	| null
	| {
			type: 'changeId';
			changeId: number;
	  }
	| {
			type: 'branchName';
			branchName: string;
	  }
>;
export async function selectChange(
	gerritRepo: Repository,
	includeMaster: boolean = false
): Promise<
	| null
	| {
			type: 'changeId';
			changeId: number;
	  }
	| {
			type: 'branchName';
			branchName: string;
	  }
> {
	// Get a list of changes
	const api = await getAPI();
	if (!api) {
		void window.showErrorMessage('Failed to connect to Gerrit API');
		return null;
	}

	const changes = await api
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
		.getValue(true);

	const quickPick = window.createQuickPick();
	const items = await Promise.all(
		changes.map(async (change) => {
			const authorName = (await change.detailedOwner())?.getName();
			return {
				label: change.subject,
				description: `${authorName ? `by ${authorName} - ` : ''}${
					change.number
				}`,
				detail: change.changeID,
			};
		})
	);
	let mainBranchName = '';
	if (includeMaster) {
		mainBranchName = await getMainBranchName(gerritRepo);
		items.push({
			label: mainBranchName,
			description: 'Main branch',
			detail: mainBranchName,
		});
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
		  }
		| {
				type: 'branchName';
				branchName: string;
		  }
	>((resolve) => {
		disposables.push(
			quickPick.onDidHide(() => {
				resolve(null);
			})
		);
		disposables.push(
			quickPick.onDidAccept(() => {
				const currentLabel = quickPick.selectedItems[0]?.label;
				if (includeMaster && currentLabel === mainBranchName) {
					quickPick.hide();
					resolve({
						type: 'branchName',
						branchName: mainBranchName,
					});
				} else if (currentLabel) {
					const change = changes.find(
						(change) => change.subject === currentLabel
					);
					if (!change) {
						void window.showErrorMessage(
							`Invalid change label/number for change: ${currentLabel}`
						);
						resolve(null);
						return;
					}

					quickPick.hide();
					resolve({
						type: 'changeId',
						changeId: change.number,
					});
				} else if (quickPick.value && /^\d+$/.test(quickPick.value)) {
					quickPick.hide();
					resolve({
						type: 'changeId',
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
	gerritRepo: Repository,
	statusBar: CurrentChangeStatusBarManager
): Promise<void> {
	statusBar.setOverride({
		text: '$(list-unordered) Picking change...',
		tooltip: 'Picking change to check out',
	});
	const change = await selectChange(gerritRepo, true);
	if (!change) {
		statusBar.setOverride(null);
		return;
	}
	if (change.type === 'changeId') {
		statusBar.setOverride({
			text: `$(loading~spin) Checking out #${change.changeId}`,
			tooltip: `Checking out change #${change.changeId}`,
		});
		await gitCheckoutRemote(gerritRepo, change.changeId);
	} else {
		statusBar.setOverride({
			text: `$(loading~spin) Checking out ${change.branchName}`,
			tooltip: `Checking out branch ${change.branchName}`,
		});
		await gitCheckoutBranch(gerritRepo, change.branchName);
	}
	statusBar.setOverride(null);
}

async function gitCheckoutBranch(
	gerritRepo: Repository,
	branchName: string
): Promise<void> {
	const { success } = await tryExecAsync(`git checkout ${branchName}`, {
		cwd: gerritRepo.rootUri.fsPath,
		timeout: 10000,
	});

	if (!success) {
		void window.showErrorMessage(
			'Checkout failed. Please see log for more details'
		);
	}
}

export async function showCurrentChangeStatusBarIcon(
	gerritRepo: Repository,
	currentChangeStatusBar: CurrentChangeStatusBarManager,
	context: ExtensionContext
): Promise<void> {
	context.subscriptions.push(
		await onChangeLastCommit(
			gerritRepo,
			async (lastCommit) => {
				await currentChangeStatusBar.onCommitUpdate(lastCommit);
			},
			true
		)
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

	public async onCommitUpdate(lastCommit: GitCommit): Promise<void> {
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

		const subscription = await GerritChange.getChange(changeID, [], {
			allowFail: true,
		});
		subscription.subscribeOnce(
			new WeakRef(async () => {
				await this.onCommitUpdate(lastCommit);
			})
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
