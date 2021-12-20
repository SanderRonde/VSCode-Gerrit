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
	nextUnresolvedComment,
	previousUnresolvedComment,
} from '../providers/comments/commentCommands';
import { fetchMoreTreeItemEntries } from '../views/activityBar/changes/fetchMoreTreeItem';
import {
	openChangeSelector,
	openCurrentChangeOnline,
} from '../views/statusBar';
import { clearSearchResults, search } from '../views/activityBar/search/search';
import { ChangeTreeView } from '../views/activityBar/changes/changeTreeView';
import { listenForStreamEvents } from '../lib/stream-events/stream-events';
import { enterCredentials } from '../lib/credentials/credentials';
import { focusChange } from '../lib/commandHandlers/focusChange';
import { checkConnection } from '../lib/gerrit/gerritAPI';
import { commands, ExtensionContext } from 'vscode';
import { gitReview } from '../lib/git/git';

export enum GerritExtensionCommands {
	CREATE_COMMENT_RESOLVED = 'gerrit.createCommentResolved',
	CREATE_COMMENT_UNRESOLVED = 'gerrit.createCommentUnresolved',
	CANCEL_COMMENT = 'gerrit.cancelComment',
	ENTER_CREDENTIALS = 'gerrit.enterCredentials',
	ACK_COMMENT_THREAD = 'gerrit.ackCommentThread',
	DONE_COMMENT_THREAD = 'gerrit.doneCommentThread',
	CHECK_CONNECTION = 'gerrit.checkConnection',
	DELETE_COMMENT = 'gerrit.deleteComment',
	EDIT_COMMENT = 'gerrit.editComment',
	RESOLVE_COMMENT = 'gerrit.toggleResolvedOn',
	UNRESOLVE_COMMENT = 'gerrit.toggleResolvedOff',
	COLLAPSE_ALL_COMMENTS = 'gerrit.collapseAllComments',
	FILE_OPEN_ONLINE = 'gerrit.openOnline',
	FILE_OPEN_MODIFIED = 'gerrit.openModified',
	FILE_OPEN_ORIGINAL = 'gerrit.openOriginal',
	FETCH_MORE = 'gerrit.fetchMore',
	OPEN_CHANGE_SELECTOR = 'gerrit.openChangeSelector',
	REFRESH_CHANGES = 'gerrit.refreshChanges',
	CONFIGURE_CHANGE_LIST = 'gerrit.configureChangeList',
	SEARCH = 'gerrit.search',
	CLEAR_SEARCH_RESULTS = 'gerrit.clearSearchResults',
	OPEN_IN_REVIEW = 'gerrit.openInReview',
	OPEN_PATCHSET_SELECTOR = 'gerrit.openPatchsetSelector',
	RESET_PATCHSET_SELECTOR = 'gerrit.resetPatchsetSelection',
	SELECT_ACTIVE_VIEW = 'gerrit.selectActiveView',
	CHECKOUT_BRANCH = 'gerrit.checkoutBranch',
	CHANGE_OPEN_ONLINE = 'gerrit.openChangeOnline',
	NEXT_UNRESOLVED_COMMENT = 'gerrit.nextUnresolvedComment',
	PREVIOUS_UNRESOLVED_COMMENT = 'gerrit.previousUnresolvedComment',
	OPEN_CURRENT_CHANGE_ONLINE = 'gerrit.openCurrentOnline',
	FOCUS_CHANGE = 'gerrit.focusChange',
	PUSH_FOR_REVIEW = 'gerrit.pushForReview',
	COPY_COMMENT_LINK = 'gerrit.copyCommentLink',
	OPEN_COMMENT_ONLINE = 'gerrit.openCommentOnline',
	RETRY_LISTEN_FOR_STREAM_EVENTS = 'gerrit.listenForStreamEvents',
}

export function registerCommands(context: ExtensionContext): void {
	// Credentials/connection
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.ENTER_CREDENTIALS,
			enterCredentials
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CHECK_CONNECTION,
			checkConnection
		)
	);

	// Comments
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CANCEL_COMMENT,
			cancelComment
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CREATE_COMMENT_RESOLVED,
			(reply: NewlyCreatedGerritCommentReply) => saveComment(reply, true)
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CREATE_COMMENT_UNRESOLVED,
			(reply: NewlyCreatedGerritCommentReply) => saveComment(reply, false)
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.RESOLVE_COMMENT,
			(reply: NewlyCreatedGerritCommentReply) =>
				setCommentResolved(reply, true)
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.UNRESOLVE_COMMENT,
			(reply: NewlyCreatedGerritCommentReply) =>
				setCommentResolved(reply, false)
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.COLLAPSE_ALL_COMMENTS,
			collapseAllComments
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.DELETE_COMMENT,
			deleteComment
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.EDIT_COMMENT,
			editComment
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.DONE_COMMENT_THREAD,
			doneComment
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.ACK_COMMENT_THREAD,
			ackComment
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.NEXT_UNRESOLVED_COMMENT,
			nextUnresolvedComment
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.PREVIOUS_UNRESOLVED_COMMENT,
			previousUnresolvedComment
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.COPY_COMMENT_LINK,
			copyCommentLink
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.OPEN_COMMENT_ONLINE,
			openCommentOnline
		)
	);

	// Opening file
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.FILE_OPEN_ONLINE,
			openFileOnline
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.FILE_OPEN_MODIFIED,
			openModified
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.FILE_OPEN_ORIGINAL,
			openOriginal
		)
	);

	// Statusbar
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.OPEN_CHANGE_SELECTOR,
			openChangeSelector
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.RETRY_LISTEN_FOR_STREAM_EVENTS,
			listenForStreamEvents
		)
	);

	// View (dashboard) actions
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.FETCH_MORE,
			fetchMoreTreeItemEntries
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.REFRESH_CHANGES,
			refreshChanges
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CONFIGURE_CHANGE_LIST,
			configureChangeLists
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.SELECT_ACTIVE_VIEW,
			selectActiveView
		)
	);

	// Search
	context.subscriptions.push(
		commands.registerCommand(GerritExtensionCommands.SEARCH, search)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CLEAR_SEARCH_RESULTS,
			clearSearchResults
		)
	);

	// Change buttons
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.OPEN_IN_REVIEW,
			async (change: ChangeTreeView) => await change.openInReview()
		)
	);

	// Patches
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.OPEN_PATCHSET_SELECTOR,
			(e: ChangeTreeView) => e.openPatchsetSelector()
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.RESET_PATCHSET_SELECTOR,
			(e: ChangeTreeView) => e.resetPatchsetSelector()
		)
	);

	// Git
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CHECKOUT_BRANCH,
			checkoutBranch
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CHANGE_OPEN_ONLINE,
			openChangeOnline
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.PUSH_FOR_REVIEW,
			gitReview
		)
	);

	// Non-button separate commands
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.OPEN_CURRENT_CHANGE_ONLINE,
			openCurrentChangeOnline
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.FOCUS_CHANGE,
			focusChange
		)
	);
}
