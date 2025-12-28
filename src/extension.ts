import {
	CurrentChangeStatusBarManager,
	showCurrentChangeStatusBarIcon,
} from './views/statusBar/currentChangeStatusBar';
import {
	startListeningForStreamEvents,
	testEnableStreamEvents,
} from './lib/stream-events/stream-events';
import { getReviewedStatusDecorationProvider } from './providers/reviewedStatusDecorationProvider';
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
import { getCommentDecorationProvider } from './providers/commentDecorationProvider';
import { SearchResultsTreeProvider } from './views/activityBar/searchResults';
import { CommentManager, DocumentManager } from './providers/commentProvider';
import { getOrCreateReviewWebviewProvider } from './views/activityBar/review';
import { getOrCreateChangesTreeProvider } from './views/activityBar/changes';
import { FileProvider, GERRIT_FILE_SCHEME } from './providers/fileProvider';
import { getConfiguration, initConfigListener } from './lib/vscode/config';
import { setContextProp, setDefaultContexts } from './lib/vscode/context';
import { createAutoRegisterCommand } from 'vscode-generate-package-json';
import { getAPI, setAPIGitReviewFile } from './lib/gerrit/gerritAPI';
import { GerritExtensionCommands } from './commands/command-names';
import { GERRIT_SEARCH_RESULTS_VIEW } from './lib/util/constants';
import { getGerritRepo, pickGitRepo } from './lib/gerrit/gerrit';
import { GerritUser } from './lib/gerrit/gerritAPI/gerritUser';
import { updateUploaderState } from './lib/state/uploader';
import { GerritCodicons, commands } from './commands/defs';
import { GerritSecrets } from './lib/credentials/secrets';
import { registerCommands } from './commands/commands';
import { setupChangeIDCache } from './lib/git/commit';
import { createOutputChannel } from './lib/util/log';
import { URIHandler } from './providers/uriHandler';
import { storageInit } from './lib/vscode/storage';
import { VersionNumber } from './lib/util/version';
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

	const registerCommand = createAutoRegisterCommand<GerritCodicons>(commands);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.CHANGE_GIT_REPO, pickGitRepo)
	);

	// Check if we're even using gerrit
	const gerritRepo = await getGerritRepo(context);

	// Add config listener
	initConfigListener();

	// Set context to show/hide icon
	await setContextProp('gerrit:isUsingGerrit', !!gerritRepo);
	if (!gerritRepo) {
		return;
	}

	GerritSecrets.secretStorage = context.secrets;
	await setAPIGitReviewFile(gerritRepo);

	// Register commands
	const statusBar = new CurrentChangeStatusBarManager();
	context.subscriptions.push(statusBar);
	registerCommands(statusBar, gerritRepo, context);

	const version = await (await getAPI(true))?.getGerritVersion();
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

	// Register status bar entry
	await showCurrentChangeStatusBarIcon(gerritRepo, statusBar, context);
	await showQuickCheckoutStatusBarIcons(context);

	// Test stream events
	void (async () => {
		if (
			getConfiguration().get('gerrit.streamEvents') &&
			(await testEnableStreamEvents(gerritRepo))
		) {
			context.subscriptions.push(
				await startListeningForStreamEvents(gerritRepo)
			);
		}
	})();

	// Register tree views
	context.subscriptions.push(getOrCreateChangesTreeProvider(gerritRepo));
	context.subscriptions.push(getOrCreateQuickCheckoutTreeProvider());
	context.subscriptions.push(
		window.registerWebviewViewProvider(
			'gerrit:review',
			await getOrCreateReviewWebviewProvider(gerritRepo, context),
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
				gerritRepo
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
			new FileProvider(context)
		)
	);

	// Create comment controller
	context.subscriptions.push(CommentManager.init(gerritRepo));

	// Create document manager
	context.subscriptions.push(DocumentManager.init());

	// Register comment decoration provider (comment bubbles)
	context.subscriptions.push(
		window.registerFileDecorationProvider(getCommentDecorationProvider())
	);

	// Register reviewed status decoration provider (eye icons)
	context.subscriptions.push(
		window.registerFileDecorationProvider(
			getReviewedStatusDecorationProvider()
		)
	);

	// Register filetype decoration provider
	context.subscriptions.push(
		window.registerFileDecorationProvider(
			new FileModificationStatusProvider()
		)
	);

	context.subscriptions.push(
		window.registerUriHandler(new URIHandler(gerritRepo))
	);

	// Add disposables
	context.subscriptions.push(await setupChangeIDCache(gerritRepo));
	context.subscriptions.push(await updateUploaderState(gerritRepo));
	context.subscriptions.push(fileCache);

	// Warm up cache for self
	void GerritUser.getSelf();

	// Get version number and enable/disable features
	if (version) {
		await setContextProp(
			'gerrit:hasCommentFeature',
			version.isGreaterThanOrEqual(new VersionNumber(3, 5, 0))
		);
	}
}

export function deactivate(): void {}
