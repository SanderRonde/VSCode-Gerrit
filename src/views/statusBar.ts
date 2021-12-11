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
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { GerritExtensionCommands } from '../commands/commands';
import { GerritAPIWith } from '../lib/gerrit/gerritAPI/api';
import { getAPI } from '../lib/gerrit/gerritAPI';
import { GitCommit } from '../lib/git/gitCLI';

export async function openChangeSelector(): Promise<void> {
	// Get a list of changes
	const api = await getAPI();
	if (!api) {
		void window.showErrorMessage('Failed to connect to Gerrit API');
		return;
	}

	const changes = await api.getChanges(
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
	);

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
	disposables.push(
		quickPick.onDidAccept(async () => {
			const value = quickPick.selectedItems[0]?.label ?? quickPick.value;
			const changeNumber = parseInt(value, 10);
			if (isNaN(changeNumber)) {
				void window.showErrorMessage(`Invalid change number: ${value}`);
				return;
			}

			quickPick.hide();

			await gitCheckoutRemote(changeNumber);
		})
	);
	quickPick.show();
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

	const change = await GerritChange.getChangeCached(changeID);
	if (!change) {
		void window.showErrorMessage('Failed to find current change');
		return;
	}
	await env.openExternal(
		Uri.parse(api.getURL(`c/${change.project}/+/${change.number}`, false))
	);
}

async function updateStatusBarState(
	statusBar: StatusBarItem,
	lastCommit: GitCommit
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

	const change = await GerritChange.getChangeCached(changeID);
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
			await updateStatusBarState(statusBar, lastCommit);
		}, true)
	);
}
