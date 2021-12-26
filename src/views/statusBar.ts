import {
	ExtensionContext,
	window,
	StatusBarAlignment,
	StatusBarItem,
	env,
	Uri,
	Disposable,
} from 'vscode';
import {
	isGerritCommit,
	getCurrentChangeID,
	getChangeID,
} from '../lib/git/commit';
import {
	getGitAPI,
	gitCheckoutRemote,
	onChangeLastCommit,
} from '../lib/git/git';
import { DefaultChangeFilter, filterOr } from '../lib/gerrit/gerritAPI/filters';
import { GerritExtensionCommands } from '../commands/command-names';
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { GerritAPIWith } from '../lib/gerrit/gerritAPI/api';
import { getAPI } from '../lib/gerrit/gerritAPI';
import { GitCommit } from '../lib/git/gitCLI';

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
				count: 100,
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
				label: String(change.number),
				description: `#${change.number}: ${change.subject}${
					authorName ? ` - by ${authorName}` : ''
				}`,
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
				const value =
					quickPick.selectedItems[0]?.label ?? quickPick.value;
				const changeNumber = parseInt(value, 10);
				if (isNaN(changeNumber)) {
					void window.showErrorMessage(
						`Invalid change number: ${value}`
					);
					resolve(null);
					return;
				}

				quickPick.hide();
				resolve(changeNumber);
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
	await gitCheckoutRemote(changeNumber);
}

export async function openCurrentChangeOnline(): Promise<void> {
	const changeID = await getCurrentChangeID();
	const api = await getAPI();
	if (!changeID) {
		void window.showErrorMessage('Failed to find current change ID');
		return;
	}
	if (!api) {
		void window.showErrorMessage('Failed to connect to Gerrit API');
		return;
	}

	const change = await GerritChange.getChangeOnce(changeID);
	if (!change) {
		void window.showErrorMessage('Failed to find current change');
		return;
	}
	await env.openExternal(
		Uri.parse(api.getURL(`c/${change.project}/+/${change.number}`, false))
	);
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

	const subscription = await GerritChange.getChange(changeID);
	subscription.subscribeOnce(
		new WeakRef(async () => {
			await statusbarUpdateHandler(lastCommit, statusBar);
		})
	);
	const change = await subscription.getValue();

	if (!change) {
		return statusBar.hide();
	}

	statusBar.text = `$(git-commit) #${change.number}`;
	statusBar.tooltip = `#${change.number}: ${change.subject}\nClick to list changes for checkout`;
	statusBar.show();
}

export async function showStatusBarIcon(
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
			console.log(lastCommit);
			await statusbarUpdateHandler(lastCommit, statusBar);
		}, true)
	);
}
