import {
	cancelComment,
	saveComment,
	deleteComment,
	editComment,
	NewlyCreatedGerritCommentReply,
	setCommentResolved,
	doneComment,
	ackComment,
	copyCommentLink,
	openCommentOnline,
} from '../providers/commentProvider';

import {
	openFileOnline,
	openModified,
	openOriginal,
} from '../views/activityBar/changes/changeTreeView/file/openFile';

import {
	configureChangeLists,
	refreshChanges,
	selectActiveView,
	checkoutBranch,
	openChangeOnline,
} from '../views/activityBar/changes/changeCommands';
import {
	applyQuickCheckout,
	dropQuickCheckout,
	dropQuickCheckouts,
	popQuickCheckout,
	quickCheckout,
} from '../lib/git/quick-checkout';
import {
	GerritRepo,
	getCurrentGerritRepo,
	getCurrentGerritRepoForUri,
	pickGerritRepo,
} from '../lib/gerrit/gerritRepo';
import {
	CurrentChangeStatusBarManager,
	openChangeSelector,
} from '../views/statusBar/currentChangeStatusBar';
import {
	nextUnresolvedComment,
	previousUnresolvedComment,
} from '../providers/comments/commentCommands';
import {
	CommentThread,
	ExtensionContext,
	extensions,
	SourceControl,
	Uri,
	window,
} from 'vscode';
import { CanFetchMoreTreeProvider } from '../views/activityBar/shared/canFetchMoreTreeProvider';
import { fetchMoreTreeItemEntries } from '../views/activityBar/changes/fetchMoreTreeItem';
import { openCurrentChangeOnline } from '../lib/commandHandlers/openCurrentChangeOnline';
import { FileTreeView } from '../views/activityBar/changes/changeTreeView/fileTreeView';
import { CommentDecorationProvider } from '../providers/commentDecorationProvider';
import { clearSearchResults, search } from '../views/activityBar/search/search';
import { ChangeTreeView } from '../views/activityBar/changes/changeTreeView';
import { QuickCheckoutTreeEntry } from '../views/activityBar/quickCheckout';
import { listenForStreamEvents } from '../lib/stream-events/stream-events';
import { GerritCommentBase } from '../lib/gerrit/gerritAPI/gerritComment';
import { getChangeIDFromCheckoutString, gitReview } from '../lib/git/git';
import { createAutoRegisterCommand } from 'vscode-generate-package-json';
import { rebaseOntoParent, recursiveRebase } from '../lib/git/rebase';
import { ReviewWebviewProvider } from '../views/activityBar/review';
import { enterCredentials } from '../lib/credentials/credentials';
import { focusChange } from '../lib/commandHandlers/focusChange';
import { GitExtension } from '../types/vscode-extension-git';
import { checkConnection } from '../lib/gerrit/gerritAPI';
import { GerritExtensionCommands } from './command-names';
import { openOnGitiles } from '../lib/gitiles/gitiles';
import { commands, GerritCodicons } from './defs';
import { tryExecAsync } from '../lib/git/gitCLI';
import { Data } from '../lib/util/data';

async function checkoutChange(uri: string, changeID: string): Promise<boolean> {
	const { success } = await tryExecAsync(
		`git-review -d ${getChangeIDFromCheckoutString(changeID)}`,
		{
			cwd: uri,
		}
	);
	if (!success) {
		void window.showErrorMessage('Failed to checkout change');
		return false;
	}
	return true;
}

export function registerCommands(
	currentChangeStatusBar: CurrentChangeStatusBarManager,
	reviewWebviewProvider: ReviewWebviewProvider,
	commentDecorationProvider: CommentDecorationProvider,
	gerritReposD: Data<GerritRepo[]>,
	context: ExtensionContext
): void {
	const registerCommand = createAutoRegisterCommand<GerritCodicons>(commands);

	// Credentials/connection
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.ENTER_CREDENTIALS, () =>
			enterCredentials(gerritReposD)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.CHECK_CONNECTION, async () => {
			const success = await checkConnection(gerritReposD);
			if (success) {
				await window.showInformationMessage('Succesfully connected!');
			}
		})
	);

	// Comments
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CANCEL_COMMENT,
			(reply: NewlyCreatedGerritCommentReply | GerritCommentBase) =>
				cancelComment(reply)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CREATE_COMMENT_RESOLVED,
			(reply: NewlyCreatedGerritCommentReply) => {
				const gerritRepo = getCurrentGerritRepoForUri(
					gerritReposD.get(),
					reply.thread.uri,
					'warn'
				);
				if (!gerritRepo) {
					return;
				}
				return saveComment(
					gerritReposD,
					gerritRepo,
					commentDecorationProvider,
					reply,
					true
				);
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CREATE_COMMENT_UNRESOLVED,
			(reply: NewlyCreatedGerritCommentReply) => {
				const gerritRepo = getCurrentGerritRepoForUri(
					gerritReposD.get(),
					reply.thread.uri,
					'warn'
				);
				if (!gerritRepo) {
					return;
				}
				return saveComment(
					gerritReposD,
					gerritRepo,
					commentDecorationProvider,
					reply,
					false
				);
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RESOLVE_COMMENT,
			(reply: NewlyCreatedGerritCommentReply) =>
				setCommentResolved(commentDecorationProvider, reply, true)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.UNRESOLVE_COMMENT,
			(reply: NewlyCreatedGerritCommentReply) =>
				setCommentResolved(commentDecorationProvider, reply, false)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.DELETE_COMMENT,
			(comment: GerritCommentBase) =>
				deleteComment(comment, commentDecorationProvider)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.EDIT_COMMENT,
			(comment: GerritCommentBase) => editComment(comment)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.DONE_COMMENT_THREAD,
			(comment: GerritCommentBase) => doneComment(comment)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.ACK_COMMENT_THREAD,
			(comment: GerritCommentBase) => ackComment(comment)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.NEXT_UNRESOLVED_COMMENT, () =>
			nextUnresolvedComment(gerritReposD)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.PREVIOUS_UNRESOLVED_COMMENT,
			() => previousUnresolvedComment(gerritReposD)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.COPY_COMMENT_LINK,
			(thread: CommentThread) => copyCommentLink(gerritReposD, thread)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_COMMENT_ONLINE,
			(thread: CommentThread) => openCommentOnline(gerritReposD, thread)
		)
	);

	// Opening file
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.FILE_OPEN_ONLINE,
			(treeView: FileTreeView) => openFileOnline(treeView)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.FILE_OPEN_MODIFIED,
			(treeView: FileTreeView) => openModified(treeView)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.FILE_OPEN_ORIGINAL,
			(treeView: FileTreeView) => openOriginal(treeView)
		)
	);

	// Statusbar
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_CHANGE_SELECTOR,
			async () => openChangeSelector(gerritReposD, currentChangeStatusBar)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_CHANGE_SELECTOR2,
			async () => openChangeSelector(gerritReposD, currentChangeStatusBar)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RETRY_LISTEN_FOR_STREAM_EVENTS,
			async () => {
				const gerritRepos = gerritReposD.get();
				if (gerritRepos.length > 1) {
					void window.showInformationMessage(
						'You have multiple gerrit repositories configured. Stream events are only supported for a single repository.'
					);
					return;
				}
				context.subscriptions.push(
					await listenForStreamEvents(gerritRepos[0])
				);
			}
		)
	);

	// View (dashboard) actions
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.FETCH_MORE,
			(group: CanFetchMoreTreeProvider) => fetchMoreTreeItemEntries(group)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.REFRESH_CHANGES, () =>
			refreshChanges()
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.CONFIGURE_CHANGE_LIST, () =>
			configureChangeLists()
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.SELECT_ACTIVE_VIEW, () =>
			selectActiveView()
		)
	);

	// Search
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.SEARCH, () =>
			search(gerritReposD)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.CLEAR_SEARCH_RESULTS, () =>
			clearSearchResults()
		)
	);

	// Change buttons
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_IN_REVIEW,
			async (change: ChangeTreeView) =>
				await change.openInReview(reviewWebviewProvider)
		)
	);

	// Patches
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_PATCHSET_SELECTOR,
			(e: ChangeTreeView) => e.openPatchsetSelector()
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RESET_PATCHSET_SELECTOR,
			(e: ChangeTreeView) => e.resetPatchsetSelector()
		)
	);

	// Git
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CHECKOUT_BRANCH,
			(changeTreeView: ChangeTreeView) =>
				checkoutBranch(changeTreeView.gerritRepo, changeTreeView)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CHANGE_OPEN_ONLINE,
			(changeTreeView: ChangeTreeView) => openChangeOnline(changeTreeView)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.REBASE,
			async (changeTreeView: ChangeTreeView) => {
				const gitURI = changeTreeView.gerritRepo.rootPath;
				if (!(await checkoutChange(gitURI, changeTreeView.changeID))) {
					return;
				}

				await rebaseOntoParent(changeTreeView.gerritRepo);
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.REBASE_CURRENT,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			async () => {
				const currentRepo = getCurrentGerritRepo(
					gerritReposD.get(),
					'warn'
				);
				if (!currentRepo) {
					return;
				}
				await rebaseOntoParent(currentRepo);
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RECURSIVE_REBASE,
			async (changeTreeView: ChangeTreeView) => {
				const gitURI = changeTreeView.gerritRepo.rootPath;
				if (!(await checkoutChange(gitURI, changeTreeView.changeID))) {
					return;
				}

				await recursiveRebase(gerritReposD, changeTreeView.gerritRepo);
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RECURSIVE_REBASE_CURRENT,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			async () => {
				const currentRepo = getCurrentGerritRepo(
					gerritReposD.get(),
					'warn'
				);
				if (!currentRepo) {
					return;
				}
				await recursiveRebase(gerritReposD, currentRepo);
			}
		)
	);

	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.PUSH_FOR_REVIEW,
			async (sourceControl: SourceControl) => {
				const gitAPI =
					extensions.getExtension<GitExtension>('vscode.git');

				if (!gitAPI) {
					return;
				}

				// try to guess the repository based on the first argument
				const gerritRepos = gerritReposD.get();
				const repository =
					gerritRepos.length === 1
						? gerritRepos[0]
						: gerritRepos.find(
								(repo) =>
									repo.repository.repository.sourceControl ===
									sourceControl
							);
				if (!repository) {
					void window.showErrorMessage('Could not find repository');
					return;
				}

				await gitReview(repository, reviewWebviewProvider);
			}
		)
	);

	// Quick-checkout
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.QUICK_CHECKOUT,
			(changeTreeView: ChangeTreeView) =>
				quickCheckout(changeTreeView.gerritRepo, changeTreeView)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.DROP_QUICK_CHECKOUT,
			(treeItem: QuickCheckoutTreeEntry) =>
				dropQuickCheckout(treeItem.info.gerritRepo, treeItem)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.QUICK_CHECKOUT_APPLY,
			(treeItem: QuickCheckoutTreeEntry) =>
				applyQuickCheckout(treeItem.info.gerritRepo, treeItem)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.QUICK_CHECKOUT_POP,
			(treeItem: QuickCheckoutTreeEntry) =>
				popQuickCheckout(treeItem.info.gerritRepo, treeItem)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.DROP_QUICK_CHECKOUTS,
			async () => {
				const repo = await pickGerritRepo(gerritReposD.get());
				if (repo) {
					await dropQuickCheckouts(repo);
				}
			}
		)
	);

	// Gutter commands
	const gitilesHandler = (permalink: boolean) => {
		return (gutter?: { lineNumber: number; uri: Uri }) => {
			const uri =
				gutter?.uri ?? window.activeTextEditor?.document.uri ?? null;
			const gerritRepo = getCurrentGerritRepoForUri(
				gerritReposD.get(),
				uri,
				'warn'
			);
			if (!gerritRepo) {
				return;
			}

			if (gutter) {
				void openOnGitiles(
					gerritReposD,
					gerritRepo,
					permalink,
					gutter.uri,
					gutter.lineNumber
				);
				return;
			}

			if (!window.activeTextEditor) {
				void window.showErrorMessage('No file open to open on gitiles');
				return;
			}

			void openOnGitiles(
				gerritReposD,
				gerritRepo,
				permalink,
				window.activeTextEditor.document.uri,
				window.activeTextEditor.selection.active.line
			);
		};
	};
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_LINE_ON_GITILES,
			gitilesHandler(false)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_LINE_ON_GITILES_PERMALINK,
			gitilesHandler(true)
		)
	);

	// Non-button separate commands
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_CURRENT_CHANGE_ONLINE,
			() => openCurrentChangeOnline(gerritReposD)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.FOCUS_CHANGE, () =>
			focusChange(gerritReposD)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.OPEN_FILE_ON_GITILES, () => {
			const uri = window.activeTextEditor?.document.uri;
			if (!uri) {
				void window.showErrorMessage('No file open to open on gitiles');
				return;
			}
			const gerritRepo = getCurrentGerritRepoForUri(
				gerritReposD.get(),
				uri,
				'warn'
			);
			if (!gerritRepo) {
				return;
			}

			void openOnGitiles(gerritReposD, gerritRepo, false, uri);
		})
	);
}
