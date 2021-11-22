import { PatchesTreeProvider } from './views/activityBar/patches';
import { commands, ExtensionContext, window } from 'vscode';
import { registerCommands } from './commands/commands';
import { showStatusBarIcon } from './views/statusBar';
import { createOutputChannel } from './lib/log';
import { setContextProp } from './lib/context';
import { isUsingGerrit } from './lib/gerrit';
import { storageInit } from './lib/storage';

export async function activate(context: ExtensionContext) {
	// Initially hide icon
	setContextProp('gerrit.isUsingGerrit', false);

	// Init storage
	storageInit(context);

	// Create logging output channel
	createOutputChannel();

	// Register commands
	registerCommands(context);

	// Check if we're even using gerrit
	const usesGerrit = await isUsingGerrit();

	// Set context to show/hide icon
	setContextProp('gerrit.isUsingGerrit', usesGerrit);
	if (!usesGerrit) {
		return;
	}

	// Register status bar entry
	await showStatusBarIcon(context);

	// Register tree views
	window.registerTreeDataProvider(
		'patchExplorer',
		new PatchesTreeProvider(context)
	);
}

export function deactivate() {}
