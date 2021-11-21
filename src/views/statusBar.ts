import {
	getChange,
	getChangeCached,
	getChangeId,
	getCurrentChangeId,
	isGerritCommit,
} from '../lib/gerrit';
import {
	ExtensionContext,
	commands,
	window,
	StatusBarAlignment,
	StatusBarItem,
	env,
	Uri,
} from 'vscode';
import { getGitAPI, onChangeLastCommit } from '../lib/git';
import { Commit } from '../types/vscode-extension-git';
import { getConfiguration } from '../lib/config';
import { GerritAPIWith } from '../lib/gerritAPI';

async function onStatusBarClick() {
	const changeId = await getCurrentChangeId();
	const url = getConfiguration().get('gerrit.url');
	if (!changeId || !url) {
		return;
	}

	const change = await getChangeCached(changeId);
	if (!change) {
		return;
	}
	env.openExternal(
		Uri.parse(`${url}/c/${change.project}/+/${change._number}`)
	);
}

async function updateStatusBarState(
	statusBar: StatusBarItem,
	lastCommit: Commit
) {
	if (!isGerritCommit(lastCommit)) {
		return statusBar.hide();
	}
	const changeId = getChangeId(lastCommit);
	if (!changeId) {
		return statusBar.hide();
	}

	const change = await getChangeCached(
		changeId,
		GerritAPIWith.DETAILED_ACCOUNTS
	);
	if (!change) {
		return statusBar.hide();
	}

	const owner = await change.detailedOwner;
	const ownerName = owner?.display_name || owner?.name || owner?.username;
	statusBar.text = `$(git-commit) #${change._number}`;
	statusBar.tooltip = `#${change._number}: ${change.subject}\n${
		ownerName ? `By ${ownerName} - ` : ''
	}Click to view online`;
	statusBar.show();
}

export async function showStatusBarIcon(context: ExtensionContext) {
	const statusBarCommand = 'gerrit.patchStatus';
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
