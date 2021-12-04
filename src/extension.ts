import { FileModificationStatusProvider } from './providers/fileModificationStatusProvider';
import { FileCache } from './views/activityBar/changes/changeTreeView/file/fileCache';
import { commentDecorationProvider } from './providers/commentDecorationProvider';
import { SearchResultsTreeProvider } from './views/activityBar/searchResults';
import { FileProvider, GERRIT_FILE_SCHEME } from './providers/fileProvider';
import { setContextProp, setDefaultContexts } from './lib/vscode/context';
import { ChangesTreeProvider } from './views/activityBar/changes';
import { GerritUser } from './lib/gerrit/gerritAPI/gerritUser';
import { ExtensionContext, window, workspace } from 'vscode';
import { CommentManager } from './providers/commentProvider';
import { registerCommands } from './commands/commands';
import { showStatusBarIcon } from './views/statusBar';
import { createOutputChannel } from './lib/util/log';
import { isUsingGerrit } from './lib/gerrit/gerrit';
import { storageInit } from './lib/vscode/storage';
import { setDevContext } from './lib/util/dev';

export async function activate(context: ExtensionContext): Promise<void> {
	// Set context so we know whether we're in dev mode or not
	setDevContext(context);

	// set a bunch of default states
	await setDefaultContexts();

	// Init storage
	storageInit(context);

	// Create logging output channel
	createOutputChannel();

	// Register commands
	registerCommands(context);

	// Check if we're even using gerrit
	const usesGerrit = await isUsingGerrit();

	// Set context to show/hide icon
	await setContextProp('gerrit:isUsingGerrit', usesGerrit);
	if (!usesGerrit) {
		return;
	}

	// Register status bar entry
	await showStatusBarIcon(context);

	// Register tree views
	context.subscriptions.push(
		window.createTreeView('gerrit:changeExplorer', {
			treeDataProvider: new ChangesTreeProvider(),
			showCollapseAll: true,
		})
	);
	context.subscriptions.push(
		(() => {
			const searchResultsTreeProvider = new SearchResultsTreeProvider();
			const treeView = window.createTreeView('gerrit:searchResults', {
				treeDataProvider: searchResultsTreeProvider,
				showCollapseAll: true,
			});
			searchResultsTreeProvider.treeView = treeView;
			return treeView;
		})()
	);

	// Register file provider
	context.subscriptions.push(
		workspace.registerTextDocumentContentProvider(
			GERRIT_FILE_SCHEME,
			new FileProvider(context)
		)
	);

	// Create comment controller
	context.subscriptions.push(CommentManager.init());

	// Register comment decoration provider (comment bubbles)
	context.subscriptions.push(
		window.registerFileDecorationProvider(commentDecorationProvider)
	);

	// Register filetype decoration provider
	context.subscriptions.push(
		window.registerFileDecorationProvider(
			new FileModificationStatusProvider()
		)
	);

	// Warm up cache for self
	void GerritUser.getSelf();
}

export function deactivate(): void {
	FileCache.clear();
}
