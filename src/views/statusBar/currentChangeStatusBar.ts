import {
	ExtensionContext,
	window,
	StatusBarAlignment,
	StatusBarItem,
	Disposable,
} from 'vscode';
import {
	getGitAPI,
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
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { getAPI } from '../../lib/gerrit/gerritAPI';
import { GitCommit } from '../../lib/git/gitCLI';

export async function selectChange(): Promise<number | null> {
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
	quickPick.items = await Promise.all(
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

	const disposables: Disposable[] = [];
	quickPick.matchOnDescription = true;
	quickPick.matchOnDetail = true;
	disposables.push(
		quickPick.onDidHide(() => {
			disposables.forEach((d) => void d.dispose());
		})
	);

	return new Promise<number | null>((resolve) => {
		disposables.push(
			quickPick.onDidAccept(() => {
				const currentLabel = quickPick.selectedItems[0]?.label;
				if (currentLabel) {
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
					resolve(change.number);
				} else if (quickPick.value && /^\d+$/.test(quickPick.value)) {
					quickPick.hide();
					resolve(parseInt(quickPick.value, 10));
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
	const changeNumber = await selectChange();
	if (!changeNumber) {
		return;
	}
	await gitCheckoutRemote(changeNumber, true);
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

	const gitAPI = getGitAPI();
	if (!gitAPI) {
		return;
	}

	const repo = gitAPI.repositories[0];
	if (!repo) {
		return;
	}

	context.subscriptions.push(
		await onChangeLastCommit(async (lastCommit) => {
			await statusbarUpdateHandler(lastCommit, statusBar);
		}, true)
	);
}
