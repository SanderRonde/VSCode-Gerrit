import { GerritExtensionCommands } from '../commands/commands';
import { commands, window } from 'vscode';

export function showInvalidSettingsMessage(message: string) {
	const openSettingsFileOption = 'Open settings file';
	const launchCommandOption = 'Launch credentials command';
	window
		.showErrorMessage(message, openSettingsFileOption, launchCommandOption)
		.then((selection) => {
			if (selection === openSettingsFileOption) {
				commands.executeCommand('workbench.action.openSettings');
			} else if (selection === launchCommandOption) {
				commands.executeCommand(
					GerritExtensionCommands.ENTER_CREDENTIALS
				);
			}
		});
}
