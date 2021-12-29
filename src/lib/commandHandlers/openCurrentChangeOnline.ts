import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { getCurrentChangeID } from '../git/commit';
import { getAPI } from '../gerrit/gerritAPI';
import { env, Uri, window } from 'vscode';

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
