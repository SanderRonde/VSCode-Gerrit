import { EXTENSION_ID } from '../../../lib/util/constants';
import { ChangesTreeProvider } from '../changes';
import { commands } from 'vscode';

export function refreshChanges(): void {
	ChangesTreeProvider.refesh();
}

export async function configureChangeLists(): Promise<void> {
	await commands.executeCommand(
		'workbench.action.openSettings',
		`@ext:${EXTENSION_ID} changes`
	);
}
