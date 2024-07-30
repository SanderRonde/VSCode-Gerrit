import { GerritExtensionCommands } from '../../commands/command-names';
import { checkConnection } from '../gerrit/gerritAPI';
import { GerritRepo } from '../gerrit/gerritRepo';
import { EXTENSION_ID } from '../util/constants';
import { commands, window } from 'vscode';
import { Data } from '../util/data';

export async function showInvalidSettingsMessage(
	gerritReposD: Data<GerritRepo[]>,
	message: string
): Promise<void> {
	const openSettingsFileOption = 'Open settings file';
	const launchCommandOption = 'Launch credentials command';
	await window
		.showErrorMessage(message, launchCommandOption, openSettingsFileOption)
		.then(async (selection) => {
			if (selection === openSettingsFileOption) {
				await commands.executeCommand(
					'workbench.action.openSettings',
					`@ext:${EXTENSION_ID} auth`
				);
			} else if (selection === launchCommandOption) {
				await commands.executeCommand(
					GerritExtensionCommands.ENTER_CREDENTIALS
				);
				await checkConnection(gerritReposD);
			}
		});
}
