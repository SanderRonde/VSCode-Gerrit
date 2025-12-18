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
	FileTreeView,
	MaybeDiffCommandArgs,
} from '../views/activityBar/changes/changeTreeView/fileTreeView';
import {
	CurrentChangeStatusBarManager,
	openChangeSelector,
} from '../views/statusBar/currentChangeStatusBar';
import {
	nextUnresolvedComment,
	previousUnresolvedComment,
} from '../providers/comments/commentCommands';
import { CanFetchMoreTreeProvider } from '../views/activityBar/shared/canFetchMoreTreeProvider';
import { fetchMoreTreeItemEntries } from '../views/activityBar/changes/fetchMoreTreeItem';
import { openCurrentChangeOnline } from '../lib/commandHandlers/openCurrentChangeOnline';
import { clearSearchResults, search } from '../views/activityBar/search/search';
import { ChangeTreeView } from '../views/activityBar/changes/changeTreeView';
import { QuickCheckoutTreeEntry } from '../views/activityBar/quickCheckout';
import { listenForStreamEvents } from '../lib/stream-events/stream-events';
import { GerritCommentBase } from '../lib/gerrit/gerritAPI/gerritComment';
import { getChangeIDFromCheckoutString, gitReview } from '../lib/git/git';
import { createAutoRegisterCommand } from 'vscode-generate-package-json';
import { enterCredentials } from '../lib/credentials/enterCredentials';
import { rebaseOntoParent, recursiveRebase } from '../lib/git/rebase';
import { CommentThread, ExtensionContext, Uri, window, env } from 'vscode';
import { focusChange } from '../lib/commandHandlers/focusChange';
import { GerritAPIWith } from '../lib/gerrit/gerritAPI/api';
import { Repository } from '../types/vscode-extension-git';
import { checkConnection, getAPI } from '../lib/gerrit/gerritAPI';
import { GerritExtensionCommands } from './command-names';
import { openOnGitiles } from '../lib/gitiles/gitiles';
import { commands as vscodeCommands } from 'vscode';
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

async function cherryPickChange(
	changeTreeView: ChangeTreeView
): Promise<void> {
	const api = await getAPI();
	if (!api) {
		void window.showErrorMessage(
			'Failed to connect to Gerrit API. Please check your credentials.'
		);
		return;
	}

	const change = await changeTreeView.change;
	if (!change) {
		void window.showErrorMessage('Failed to get change information');
		return;
	}

	// Get the current revision
	const currentRevision = await change.currentRevision(
		GerritAPIWith.CURRENT_REVISION
	);
	if (!currentRevision) {
		void window.showErrorMessage('Failed to get current revision');
		return;
	}

	// Ask user for destination branch
	const destinationBranch = await window.showInputBox({
		prompt: 'Enter the destination branch for cherry-pick',
		placeHolder: 'e.g., stable-1.0, release/v2.0',
		validateInput: (value) => {
			if (!value || value.trim() === '') {
				return 'Branch name cannot be empty';
			}
			return null;
		},
	});

	if (!destinationBranch) {
		return; // User cancelled
	}

	// Get current commit message to use as default
	const currentCommit = await change.getCurrentCommit(
		GerritAPIWith.CURRENT_COMMIT
	);
	const defaultMessage = currentCommit?.message ?? change.subject;

	// Ask user if they want to modify the commit message
	const messageChoice = await window.showQuickPick(
		[
			{
				label: 'Use original commit message',
				description: 'Keep the existing commit message',
				useOriginal: true,
			},
			{
				label: 'Edit commit message',
				description: 'Modify the commit message for the cherry-pick',
				useOriginal: false,
			},
		],
		{
			placeHolder: 'Choose how to handle the commit message',
		}
	);

	if (!messageChoice) {
		return; // User cancelled
	}

	let commitMessage: string | undefined;
	if (!messageChoice.useOriginal) {
		commitMessage = await window.showInputBox({
			prompt: 'Enter the commit message for the cherry-pick',
			value: defaultMessage,
			valueSelection: [0, defaultMessage.indexOf('\n') > 0 ? defaultMessage.indexOf('\n') : defaultMessage.length],
		});

		if (commitMessage === undefined) {
			return; // User cancelled
		}
	}

	// Perform the cherry-pick
	const result = await window.withProgress(
		{
			location: { viewId: 'gerrit:changeExplorer' },
			title: `Cherry-picking to ${destinationBranch}...`,
		},
		async () => {
			return await api.cherryPick(
				change.changeID,
				currentRevision.id,
				{
					destination: destinationBranch.trim(),
					message: commitMessage,
				}
			);
		}
	);

	if (result) {
		const openOnline = 'Open Online';
		const response = await window.showInformationMessage(
			`Successfully cherry-picked change to ${destinationBranch}. New change: #${result.number}`,
			openOnline
		);

		if (response === openOnline) {
			const url = api.getPublicUrl(`c/${result.project}/+/${result.number}`);
			await env.openExternal(Uri.parse(url));
		}
	} else {
		void window.showErrorMessage(
			`Failed to cherry-pick change to ${destinationBranch}. Please check if the branch exists and you have permissions.`
		);
	}
}

export function registerCommands(
	currentChangeStatusBar: CurrentChangeStatusBarManager,
	gerritRepo: Repository,
	context: ExtensionContext
): void {
	const registerCommand = createAutoRegisterCommand<GerritCodicons>(commands);

	// Credentials/connection
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.ENTER_CREDENTIALS, () =>
			enterCredentials(gerritRepo)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.CHECK_CONNECTION, () =>
			checkConnection()
		)
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
			GerritExtensionCommands.DELETE_COMMENT,
			(comment: GerritCommentBase) => deleteComment(comment)
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
			nextUnresolvedComment(gerritRepo)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.PREVIOUS_UNRESOLVED_COMMENT,
			() => previousUnresolvedComment(gerritRepo)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.COPY_COMMENT_LINK,
			(thread: CommentThread) => copyCommentLink(thread)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_COMMENT_ONLINE,
			(thread: CommentThread) => openCommentOnline(thread)
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
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.MAYBE_DIFF,
			async (args: MaybeDiffCommandArgs) => {
				// This step is relatively heavy, so we register a light
				// command (the maybe-diff) that will execute the heavy
				// command (the diff) when clicked.
				const diffCommand = await FileTreeView.createDiffCommand(
					args.gerritRepo,
					args.file,
					args.patchsetBase
				);
				if (diffCommand) {
					await vscodeCommands.executeCommand(
						diffCommand.command,
						// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
						...(diffCommand.arguments ?? [])
					);
				}
			}
		)
	);

	// Statusbar
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_CHANGE_SELECTOR,
			async () => openChangeSelector(gerritRepo, currentChangeStatusBar)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.OPEN_CHANGE_SELECTOR2,
			async () => openChangeSelector(gerritRepo, currentChangeStatusBar)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RETRY_LISTEN_FOR_STREAM_EVENTS,
			async () =>
				context.subscriptions.push(
					await listenForStreamEvents(gerritRepo)
				)
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
		registerCommand(GerritExtensionCommands.SEARCH, () => search())
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
		registerCommand(
			GerritExtensionCommands.CHECKOUT_BRANCH,
			(changeTreeView: ChangeTreeView) =>
				checkoutBranch(gerritRepo, changeTreeView)
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
				const gitURI = gerritRepo.rootUri.fsPath;
				if (
					!(await checkoutChange(
						gitURI,
						changeTreeView.initialChange.changeID
					))
				) {
					return;
				}

				await rebaseOntoParent(gerritRepo);
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.REBASE_CURRENT,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			async () => await rebaseOntoParent(gerritRepo)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RECURSIVE_REBASE,
			async (changeTreeView: ChangeTreeView) => {
				const gitURI = gerritRepo.rootUri.fsPath;
				if (
					!(await checkoutChange(
						gitURI,
						changeTreeView.initialChange.changeID
					))
				) {
					return;
				}

				await recursiveRebase(gerritRepo);
			}
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.RECURSIVE_REBASE_CURRENT,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			async () => await recursiveRebase(gerritRepo)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.PUSH_FOR_REVIEW, () =>
			gitReview(gerritRepo)
		)
	);

	// Cherry-pick
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.CHERRY_PICK,
			(changeTreeView: ChangeTreeView) => cherryPickChange(changeTreeView)
		)
	);

	// Quick-checkout
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.QUICK_CHECKOUT,
			(changeTreeView: ChangeTreeView) =>
				quickCheckout(gerritRepo, changeTreeView)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.DROP_QUICK_CHECKOUT,
			(treeItem: QuickCheckoutTreeEntry) =>
				dropQuickCheckout(gerritRepo, treeItem)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.QUICK_CHECKOUT_APPLY,
			(treeItem: QuickCheckoutTreeEntry) =>
				applyQuickCheckout(gerritRepo, treeItem)
		)
	);
	context.subscriptions.push(
		registerCommand(
			GerritExtensionCommands.QUICK_CHECKOUT_POP,
			(treeItem: QuickCheckoutTreeEntry) =>
				popQuickCheckout(gerritRepo, treeItem)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.DROP_QUICK_CHECKOUTS, () =>
			dropQuickCheckouts(gerritRepo)
		)
	);

	// context.subscriptions.push(
	// 	registerCommand(GerritExtensionCommands.CHANGE_GIT_REPO, () =>
	// 		pickGitRepo()
	// 	)
	// );

	// Gutter commands
	const gitilesHandler = (permalink: boolean) => {
		return (gutter?: { lineNumber: number; uri: Uri }) => {
			if (gutter) {
				void openOnGitiles(
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
			() => openCurrentChangeOnline(gerritRepo)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.FOCUS_CHANGE, () =>
			focusChange(gerritRepo)
		)
	);
	context.subscriptions.push(
		registerCommand(GerritExtensionCommands.OPEN_FILE_ON_GITILES, () => {
			const uri = window.activeTextEditor?.document.uri;
			if (!uri) {
				void window.showErrorMessage('No file open to open on gitiles');
				return;
			}
			void openOnGitiles(gerritRepo, false, uri);
		})
	);
}
