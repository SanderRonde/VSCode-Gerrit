import {
	CurrentChangeStatusBarManager,
	showCurrentChangeStatusBarIcon,
} from './views/statusBar/currentChangeStatusBar';
import {
	startListeningForStreamEvents,
	testEnableStreamEvents,
} from './lib/stream-events/stream-events';
import { FileModificationStatusProvider } from './providers/fileModificationStatusProvider';
import { showQuickCheckoutStatusBarIcons } from './views/statusBar/quickCheckoutStatusBar';
import { getOrCreateQuickCheckoutTreeProvider } from './views/activityBar/quickCheckout';
import {
	ConfigurationTarget,
	ExtensionContext,
	window,
	workspace,
} from 'vscode';
import { fileCache } from './views/activityBar/changes/changeTreeView/file/fileCache';
import { CommentDecorationProvider } from './providers/commentDecorationProvider';
import { SearchResultsTreeProvider } from './views/activityBar/searchResults';
import { CommentManager, DocumentManager } from './providers/commentProvider';
import { getGerritRepos, setListenerForRepos } from './lib/gerrit/gerritRepo';
import { getOrCreateChangesTreeProvider } from './views/activityBar/changes';
import { FileProvider, GERRIT_FILE_SCHEME } from './providers/fileProvider';
import { setContextProp, setDefaultContexts } from './lib/vscode/context';
import { checkConnection, getAPIForRepo } from './lib/gerrit/gerritAPI';
import { ReviewWebviewProvider } from './views/activityBar/review';
import { GERRIT_SEARCH_RESULTS_VIEW } from './lib/util/constants';
import { GerritUser } from './lib/gerrit/gerritAPI/gerritUser';
import { updateUploaderState } from './lib/state/uploader';
import { getConfiguration } from './lib/vscode/config';
import { registerCommands } from './commands/commands';
import { setupChangeIDCache } from './lib/git/commit';
import { createOutputChannel } from './lib/util/log';
import { URIHandler } from './providers/uriHandler';
import { storageInit } from './lib/vscode/storage';
import { VersionNumber } from './lib/util/version';
import { setDevContext } from './lib/util/dev';
import { Data } from './lib/util/data';

export async function activate(context: ExtensionContext): Promise<void> {
	// Set context so we know whether we're in dev mode or not
	setDevContext(context);

	// set a bunch of default states
	await setDefaultContexts();

	// Init storage
	storageInit(context);

	// Create logging output channel
	createOutputChannel();

	// Check if we're even using gerrit
	const gerritReposD = await getGerritRepos(context);

	gerritReposD.subscribe((gerritRepos) => {
		// Set context to show/hide icon
		void setContextProp('gerrit:isUsingGerrit', !!gerritRepos.length);
	});

	// Wait for gerrit repos to be loaded (if any)
	await gerritReposD.waitFor((gerritRepos) => gerritRepos.length > 0);

	// Register commands
	const statusBar = new CurrentChangeStatusBarManager();
	context.subscriptions.push(statusBar);
	const reviewWebviewProvider = new ReviewWebviewProvider(
		gerritReposD,
		context
	);
	const commentDecorationProvider = new CommentDecorationProvider(
		gerritReposD
	);
	registerCommands(
		statusBar,
		reviewWebviewProvider,
		commentDecorationProvider,
		gerritReposD,
		context
	);

	for (const gerritRepo of gerritReposD.get()) {
		const version = await (
			await getAPIForRepo(gerritReposD, gerritRepo, true)
		)?.getGerritVersion();
		if (version?.isSmallerThan(new VersionNumber(3, 4, 0))) {
			// Pre-unsupported versions check if force-enable is enabled
			if (!getConfiguration().get('gerrit.forceEnable')) {
				// If not, ask user what to do
				const FORCE_ENABLE_OPTION = 'Try anyway (might not work)';
				const answer = await window.showErrorMessage(
					`The gerrit extension does not support gerrit instances before version 3.4.0 (you have ${
						version ? version.toString() : 'unknown'
					})`,
					FORCE_ENABLE_OPTION,
					'Dismiss'
				);

				// If not force enable, disable extension
				if (answer !== FORCE_ENABLE_OPTION) {
					return;
				}

				// If force enable, set forceEnable config option
				await getConfiguration().update(
					'gerrit.forceEnable',
					true,
					ConfigurationTarget.Global
				);
			}
		}
	}

	const hasCommentFeatureD = new Data(true);
	context.subscriptions.push(
		setListenerForRepos(gerritReposD, async (gerritRepo) => {
			const version = await (
				await getAPIForRepo(gerritReposD, gerritRepo, true)
			)?.getGerritVersion();

			hasCommentFeatureD.update(
				(hasCommentFeature) =>
					hasCommentFeature &&
					!!version?.isGreaterThanOrEqual(new VersionNumber(3, 5, 0))
			);
			// Get version number and enable/disable features
			await setContextProp(
				'gerrit:hasCommentFeature',
				hasCommentFeatureD.get()
			);
		})
	);

	// Register status bar entry
	showCurrentChangeStatusBarIcon(gerritReposD, statusBar, context);
	await showQuickCheckoutStatusBarIcons(context);

	// Test stream events
	setListenerForRepos(gerritReposD, async () => {
		if (getConfiguration().get('gerrit.streamEvents')) {
			const gerritRepos = gerritReposD.get();
			if (gerritRepos.length > 1) {
				void window.showInformationMessage(
					'You have multiple gerrit repositories configured. Stream events are only supported for a single repository.'
				);
			} else if (await testEnableStreamEvents(gerritRepos[0])) {
				context.subscriptions.push(
					await startListeningForStreamEvents(gerritRepos[0])
				);
			}
		}
	});

	// Register tree views
	context.subscriptions.push(getOrCreateChangesTreeProvider(gerritReposD));
	context.subscriptions.push(getOrCreateQuickCheckoutTreeProvider());
	context.subscriptions.push(
		window.registerWebviewViewProvider(
			'gerrit:review',
			reviewWebviewProvider,
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
				gerritReposD
			);
			const treeView = window.createTreeView(GERRIT_SEARCH_RESULTS_VIEW, {
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
			new FileProvider(context, gerritReposD)
		)
	);

	// Create comment controller
	context.subscriptions.push(CommentManager.init(gerritReposD));

	// Create document manager
	context.subscriptions.push(DocumentManager.init());

	// Register comment decoration provider (comment bubbles)
	context.subscriptions.push(
		window.registerFileDecorationProvider(commentDecorationProvider)
	);

	// Register filetype decoration provider
	context.subscriptions.push(
		window.registerFileDecorationProvider(
			new FileModificationStatusProvider(gerritReposD)
		)
	);

	context.subscriptions.push(
		window.registerUriHandler(new URIHandler(gerritReposD))
	);

	// Add disposables
	context.subscriptions.push(setupChangeIDCache(gerritReposD));
	context.subscriptions.push(updateUploaderState(gerritReposD));
	context.subscriptions.push(fileCache);

	// Warm up cache for self
	context.subscriptions.push(
		setListenerForRepos(
			gerritReposD,
			(gerritRepo) => void GerritUser.getSelf(gerritReposD, gerritRepo)
		)
	);

	// Test connections
	gerritReposD.subscribe(() => void checkConnection(gerritReposD));
}

export function deactivate(): void {}
