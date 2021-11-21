import { registerCommands } from './commands/commands';
import { showStatusBarIcon } from './views/statusBar';
import { commands, ExtensionContext } from 'vscode';
import { createOutputChannel } from './lib/log';
import { isUsingGerrit } from './lib/gerrit';

export async function activate(context: ExtensionContext) {
	// Initially hide icon
	commands.executeCommand('setContext', 'gerrit.isUsingGerrit', false);

	// Create logging output channel
	createOutputChannel();

	// Register commands
	registerCommands(context);

	// Check if we're even using gerrit
	const usesGerrit = await isUsingGerrit();

	// Set context to show/hide icon
	commands.executeCommand('setContext', 'gerrit.isUsingGerrit', usesGerrit);
	if (!usesGerrit) {
		return;
	}

	// Register status bar entry
	await showStatusBarIcon(context);
}

export function deactivate() {}
