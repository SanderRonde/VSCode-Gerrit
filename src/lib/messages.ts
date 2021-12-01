import { GerritExtensionCommands } from '../commands/commands';
import { EXTENSION_ID } from './constants';
import { commands, window } from 'vscode';

export async function showInvalidSettingsMessage(
	message: string
): Promise<void> {
	const openSettingsFileOption = 'Open settings file';
	const launchCommandOption = 'Launch credentials command';
	await window
		.showErrorMessage(message, openSettingsFileOption, launchCommandOption)
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
			}
		});
}
