import {
	ExtensionContext,
	window,
	StatusBarAlignment,
	StatusBarItem,
	Disposable,
} from 'vscode';
import {
	getGitURI,
	gitCheckoutRemote,
	onChangeLastCommit,
} from '../../lib/git/git';
import {
	DefaultChangeFilter,
	filterOr,
} from '../../lib/gerrit/gerritAPI/filters';
import { GerritExtensionCommands } from '../../commands/command-names';
import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { isGerritCommit, getChangeID } from '../../lib/git/commit';
import { GitCommit, tryExecAsync } from '../../lib/git/gitCLI';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { getGitRepo } from '../../lib/gerrit/gerrit';
import { getAPI } from '../../lib/gerrit/gerritAPI';

async function getMainBranchName(): Promise<string> {
	const gitURI = getGitURI();
	if (!gitURI) {
		return 'master';
	}

	const cmd = await tryExecAsync(
		"git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'",
		{
			cwd: gitURI,
			timeout: 2000,
		}
	);
	if (cmd.success && cmd.stdout) {
		return cmd.stdout;
	}
	return 'master';
}

export async function selectChange(includeMaster?: false): Promise<null | {
	type: 'changeId';
	changeId: number;
}>;
export async function selectChange(includeMaster: true): Promise<
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
export async function selectChange(includeMaster: boolean = false): Promise<
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
						DefaultChangeFilter.REVIEWER_SELF,
						DefaultChangeFilter.ASSIGNEE_SELF
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
		mainBranchName = await getMainBranchName();
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

export async function openChangeSelector(): Promise<void> {
	const changeNumber = await selectChange(true);
	if (!changeNumber) {
		return;
	}
	if (changeNumber.type === 'changeId') {
		await gitCheckoutRemote(changeNumber.changeId, true);
	} else {
		await gitCheckoutBranch(changeNumber.branchName);
	}
}

async function gitCheckoutBranch(branchName: string): Promise<void> {
	const uri = getGitURI();
	if (!uri) {
		void window.showErrorMessage(
			'Checkout failed, failed to find git repo'
		);
		return;
	}

	const { success } = await tryExecAsync(`git checkout ${branchName}`, {
		cwd: uri,
		timeout: 10000,
	});

	if (!success) {
		void window.showErrorMessage(
			'Checkout failed. Please see log for more details'
		);
	}
}

async function statusbarUpdateHandler(
	lastCommit: GitCommit,
	statusBar: StatusBarItem
): Promise<void> {
	if (!isGerritCommit(lastCommit)) {
		return statusBar.hide();
	}

	const changeID = getChangeID(lastCommit);
	if (!changeID) {
		statusBar.text = '$(git-commit) unpublished change';
		statusBar.tooltip = 'Unpublished gerrit change, no ChangeID set';
		return statusBar.show();
	}

	const subscription = await GerritChange.getChange(changeID, [], {
		allowFail: true,
	});
	subscription.subscribeOnce(
		new WeakRef(async () => {
			await statusbarUpdateHandler(lastCommit, statusBar);
		}),
		{ onSame: true }
	);
	const change = await subscription.getValue();

	if (!change) {
		// Try again in a few minutes
		setTimeout(() => {
			void (async () => {
				if ((await subscription.getValue()) === null) {
					void subscription.getValue(true);
				}
			})();
		}, 5 * 60 * 1000);
		return statusBar.hide();
	}

	statusBar.text = `$(git-commit) #${change.number}`;
	statusBar.tooltip = `#${change.number}: ${change.subject}\nClick to list changes for checkout`;
	statusBar.show();
}

export async function showCurrentChangeStatusBarIcon(
	context: ExtensionContext
): Promise<void> {
	const statusBar = window.createStatusBarItem(StatusBarAlignment.Left);
	statusBar.command = GerritExtensionCommands.OPEN_CHANGE_SELECTOR;

	const repo = getGitRepo();
	if (!repo) {
		return;
	}

	context.subscriptions.push(
		await onChangeLastCommit(async (lastCommit) => {
			await statusbarUpdateHandler(lastCommit, statusBar);
		}, true)
	);
}
