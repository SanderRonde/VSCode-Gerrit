import {
	cancelComment,
	collapseAllComments,
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
	nextUnresolvedComment,
	previousUnresolvedComment,
} from '../providers/comments/commentCommands';
import { fetchMoreTreeItemEntries } from '../views/activityBar/changes/fetchMoreTreeItem';
import {
	getChangeIDFromCheckoutString,
	getGitURI,
	gitReview,
} from '../lib/git/git';
import { openCurrentChangeOnline } from '../lib/commandHandlers/openCurrentChangeOnline';
import { clearSearchResults, search } from '../views/activityBar/search/search';
import { openChangeSelector } from '../views/statusBar/currentChangeStatusBar';
import { ChangeTreeView } from '../views/activityBar/changes/changeTreeView';
import { listenForStreamEvents } from '../lib/stream-events/stream-events';
import { createAutoRegisterCommand } from 'vscode-generate-package-json';
import { rebaseOntoParent, recursiveRebase } from '../lib/git/rebase';
import { enterCredentials } from '../lib/credentials/credentials';
import { focusChange } from '../lib/commandHandlers/focusChange';
import { GerritExtensionCommands } from './command-names';
import { checkConnection } from '../lib/gerrit/gerritAPI';
import { ExtensionContext, Uri, window } from 'vscode';
import { openOnGitiles } from '../lib/gitiles/gitiles';
import { pickGitRepo } from '../lib/gerrit/gerrit';
import { commands, GerritCodicons } from './defs';
import { tryExecAsync } from '../lib/git/gitCLI';

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

export function registerCommands(context: ExtensionContext): void {
	const registerCommand = createAutoRegisterCommand<GerritCodicons>(commands);

	// Credentials/connection
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.ENTER_CREDENTIALS,
			enterCredentials
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CHECK_CONNECTION,
			checkConnection
		)
	);

	// Comments
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.CANCEL_COMMENT, cancelComment)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CREATE_COMMENT_RESOLVED,
			(reply: NewlyCreatedGerritCommentReply) => saveComment(reply, true)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CREATE_COMMENT_UNRESOLVED,
			(reply: NewlyCreatedGerritCommentReply) => saveComment(reply, false)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RESOLVE_COMMENT,
			(reply: NewlyCreatedGerritCommentReply) =>
				setCommentResolved(reply, true)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.UNRESOLVE_COMMENT,
			(reply: NewlyCreatedGerritCommentReply) =>
				setCommentResolved(reply, false)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.COLLAPSE_ALL_COMMENTS,
			collapseAllComments
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.DELETE_COMMENT, deleteComment)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.EDIT_COMMENT, editComment)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.DONE_COMMENT_THREAD,
			doneComment
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.ACK_COMMENT_THREAD, ackComment)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.NEXT_UNRESOLVED_COMMENT,
			nextUnresolvedComment
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.PREVIOUS_UNRESOLVED_COMMENT,
			previousUnresolvedComment
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.COPY_COMMENT_LINK,
			copyCommentLink
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_COMMENT_ONLINE,
			openCommentOnline
		)
	);

	// Opening file
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.FILE_OPEN_ONLINE,
			openFileOnline
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.FILE_OPEN_MODIFIED,
			openModified
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.FILE_OPEN_ORIGINAL,
			openOriginal
		)
	);

	// Statusbar
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_CHANGE_SELECTOR,
			openChangeSelector
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_CHANGE_SELECTOR2,
			openChangeSelector
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RETRY_LISTEN_FOR_STREAM_EVENTS,
			listenForStreamEvents
		)
	);

	// View (dashboard) actions
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.FETCH_MORE,
			fetchMoreTreeItemEntries
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.REFRESH_CHANGES, refreshChanges)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CONFIGURE_CHANGE_LIST,
			configureChangeLists
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.SELECT_ACTIVE_VIEW,
			selectActiveView
		)
	);

	// Search
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.SEARCH, search)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CLEAR_SEARCH_RESULTS,
			clearSearchResults
		)
	);

	// Change buttons
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_IN_REVIEW,
			async (change: ChangeTreeView) => await change.openInReview()
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
		registerCommand(GerritExtensionCommands.CHECKOUT_BRANCH, checkoutBranch)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CHANGE_OPEN_ONLINE,
			openChangeOnline
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.REBASE,
			async (changeTreeView: ChangeTreeView) => {
				const gitURI = getGitURI();
				if (
					!gitURI ||
					!(await checkoutChange(gitURI, changeTreeView.changeID))
				) {
					return;
				}

				await rebaseOntoParent();
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.REBASE_CURRENT,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			async () => await rebaseOntoParent()
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RECURSIVE_REBASE,
			async (changeTreeView: ChangeTreeView) => {
				const gitURI = getGitURI();
				if (
					!gitURI ||
					!(await checkoutChange(gitURI, changeTreeView.changeID))
				) {
					return;
				}

				await recursiveRebase();
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RECURSIVE_REBASE_CURRENT,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			async () => await recursiveRebase()
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.PUSH_FOR_REVIEW, gitReview)
	);

	// Quick-checkout
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.QUICK_CHECKOUT, quickCheckout)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.DROP_QUICK_CHECKOUT,
			dropQuickCheckout
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.QUICK_CHECKOUT_APPLY,
			applyQuickCheckout
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.QUICK_CHECKOUT_POP,
			popQuickCheckout
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.DROP_QUICK_CHECKOUTS,
			dropQuickCheckouts
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.CHANGE_GIT_REPO, pickGitRepo)
	);

	// Gutter commands
	const gitilesHandler = (permalink: boolean) => {
		return (gutter?: { lineNumber: number; uri: Uri }) => {
			if (gutter) {
				void openOnGitiles(permalink, gutter.uri, gutter.lineNumber);
				return;
			}

			if (!window.activeTextEditor) {
				void window.showErrorMessage('No file open to open on gitiles');
				return;
			}

			void openOnGitiles(
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
			openCurrentChangeOnline
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.FOCUS_CHANGE, focusChange)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.OPEN_FILE_ON_GITILES, () => {
			const uri = window.activeTextEditor?.document.uri;
			if (!uri) {
				void window.showErrorMessage('No file open to open on gitiles');
				return;
			}
			void openOnGitiles(false, uri);
		})
	);
}
