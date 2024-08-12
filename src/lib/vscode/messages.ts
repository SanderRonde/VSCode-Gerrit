import { GerritExtensionCommands } from '../../commands/command-names';
import { EXTENSION_ID } from '../util/constants';
import { commands, window } from 'vscode';

export async function showInvalidSettingsMessage(
	message: string,
	additionalButtons: {
		title: string;
		callback: () => void;
	}[] = []
): Promise<void> {
	const openSettingsFileOption = 'Open settings file';
	const launchCommandOption = 'Launch credentials command';
	await window
		.showErrorMessage(
			message,
			openSettingsFileOption,
			launchCommandOption,
			...additionalButtons.map((button) => button.title)
		)
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
			} else {
				const additionalButton = additionalButtons.find(
					(button) => button.title === selection
				);
				if (additionalButton) {
					additionalButton.callback();
				}
			}
		});
}
