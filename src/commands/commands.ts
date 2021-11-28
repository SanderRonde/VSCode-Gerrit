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
} from '../providers/commentProvider';
import { enterCredentials } from '../lib/credentials';
import { commands, ExtensionContext } from 'vscode';
import { checkConnection } from '../lib/gerritAPI';

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
}
