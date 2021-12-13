import { FileModificationStatusProvider } from './providers/fileModificationStatusProvider';
import { filesCache } from './views/activityBar/changes/changeTreeView/file/filesCache';
import { fileCache } from './views/activityBar/changes/changeTreeView/file/fileCache';
import { getCommentDecorationProvider } from './providers/commentDecorationProvider';
import { getOrCreateReviewWebviewProvider } from './views/activityBar/review';
import { CommentManager, DocumentManager } from './providers/commentProvider';
import { SearchResultsTreeProvider } from './views/activityBar/searchResults';
import { getOrCreateChangesTreeProvider } from './views/activityBar/changes';
import { FileProvider, GERRIT_FILE_SCHEME } from './providers/fileProvider';
import { setContextProp, setDefaultContexts } from './lib/vscode/context';
import { GerritUser } from './lib/gerrit/gerritAPI/gerritUser';
import { ExtensionContext, window, workspace } from 'vscode';
import { updateUploaderState } from './lib/state/uploader';
import { getChangeCache } from './lib/gerrit/gerritCache';
import { registerCommands } from './commands/commands';
import { setupChangeIDCache } from './lib/git/commit';
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
	context.subscriptions.push(getOrCreateChangesTreeProvider(context));
	context.subscriptions.push(
		window.registerWebviewViewProvider(
			'gerrit:review',
			await getOrCreateReviewWebviewProvider(context),
			{
				webviewOptions: {
					retainContextWhenHidden: true,
				},
			}
		)
	);
	context.subscriptions.push(
		(() => {
			const searchResultsTreeProvider = new SearchResultsTreeProvider(
				context
			);
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

	// Create document manager
	context.subscriptions.push(DocumentManager.init());

	// Register comment decoration provider (comment bubbles)
	context.subscriptions.push(
		window.registerFileDecorationProvider(getCommentDecorationProvider())
	);

	// Register filetype decoration provider
	context.subscriptions.push(
		window.registerFileDecorationProvider(
			new FileModificationStatusProvider()
		)
	);

	// Add disposables
	context.subscriptions.push(getChangeCache());
	context.subscriptions.push(await setupChangeIDCache());
	context.subscriptions.push(await updateUploaderState());
	context.subscriptions.push(fileCache);
	context.subscriptions.push(filesCache);

	// Warm up cache for self
	void GerritUser.getSelf();
}

export function deactivate(): void {}
