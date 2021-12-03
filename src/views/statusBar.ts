import {
	ExtensionContext,
	window,
	StatusBarAlignment,
	StatusBarItem,
	env,
	Uri,
} from 'vscode';
import { isGerritCommit, getCurrentChangeID, getChangeID } from '../lib/commit';
import { GerritExtensionCommands } from '../commands/commands';
import { GerritChange } from '../lib/gerritAPI/gerritChange';
import { getGitAPI, onChangeLastCommit } from '../lib/git';
import { GerritAPIWith } from '../lib/gerritAPI/api';
import { GitCommit } from '../lib/gitCLI';
import { getAPI } from '../lib/gerritAPI';

export async function onStatusBarClick(): Promise<void> {
	const changeID = await getCurrentChangeID();
	const api = await getAPI();
	if (!changeID || !api) {
		return;
	}

	const change = await GerritChange.getChangeCached(changeID);
	if (!change) {
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

	const change = await GerritChange.getChangeCached(
		changeID,
		GerritAPIWith.DETAILED_ACCOUNTS
	);
	if (!change) {
		return statusBar.hide();
	}

	const owner = await change.detailedOwner();
	const ownerName = owner?.getName();
	statusBar.text = `$(git-commit) #${change.number}`;
	statusBar.tooltip = `#${change.number}: ${change.subject}\n${
		ownerName ? `By ${ownerName} - ` : ''
	}Click to view online`;
	statusBar.show();
}

export async function showStatusBarIcon(
	context: ExtensionContext
): Promise<void> {
	const statusBar = window.createStatusBarItem(StatusBarAlignment.Left);
	statusBar.command = GerritExtensionCommands.CLICK_STATUSBAR;

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
