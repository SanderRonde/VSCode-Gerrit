import {
	ExtensionContext,
	commands,
	window,
	StatusBarAlignment,
	StatusBarItem,
	env,
	Uri,
} from 'vscode';
import { isGerritCommit, getCurrentChangeID, getChangeID } from '../lib/commit';
import { GerritChange } from '../lib/gerritAPI/gerritChange';
import { getGitAPI, onChangeLastCommit } from '../lib/git';
import { Commit } from '../types/vscode-extension-git';
import { GerritAPIWith } from '../lib/gerritAPI/api';
import { getConfiguration } from '../lib/config';

async function onStatusBarClick(): Promise<void> {
	const changeID = await getCurrentChangeID();
	const url = getConfiguration().get('gerrit.url');
	if (!changeID || !url) {
		return;
	}

	const change = await GerritChange.getChangeCached(changeID);
	if (!change) {
		return;
	}
	await env.openExternal(
		Uri.parse(`${url}/c/${change.project}/+/${change._number}`)
	);
}

async function updateStatusBarState(
	statusBar: StatusBarItem,
	lastCommit: Commit
): Promise<void> {
	if (!isGerritCommit(lastCommit)) {
		return statusBar.hide();
	}
	const changeID = getChangeID(lastCommit);
	if (!changeID) {
		return statusBar.hide();
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
	statusBar.text = `$(git-commit) #${change._number}`;
	statusBar.tooltip = `#${change._number}: ${change.subject}\n${
		ownerName ? `By ${ownerName} - ` : ''
	}Click to view online`;
	statusBar.show();
}

export async function showStatusBarIcon(
	context: ExtensionContext
): Promise<void> {
	const statusBarCommand = 'gerrit.changeStatus';
	context.subscriptions.push(
		commands.registerCommand(statusBarCommand, onStatusBarClick)
	);

	const statusBar = window.createStatusBarItem(StatusBarAlignment.Left);
	statusBar.command = statusBarCommand;

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
