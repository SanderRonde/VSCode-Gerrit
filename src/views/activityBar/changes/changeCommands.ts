import { EXTENSION_ID } from '../../../lib/util/constants';
import { ChangesTreeProvider } from '../changes';
import { commands } from 'vscode';
import { getAPI } from '../../../lib/gerrit/gerritAPI';
import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { gitCheckout } from '../../../lib/git/git';

export function refreshChanges(): void {
	ChangesTreeProvider.refesh();
}

export async function configureChangeLists(): Promise<void> {
	await commands.executeCommand(
		'workbench.action.openSettings',
		`@ext:${EXTENSION_ID} changes`
	);
}

export async function checkoutBranch({change}: {change: GerritChange}): Promise<void> {
	const api = await getAPI();
	if (!api) {
		return;
	}

	const res = await api.getTopic(change.changeID);
	if (!res) {
		return;
	}

	await gitCheckout(res);
}
