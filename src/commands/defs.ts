import {
	COMMENT_IS_DELETABLE,
	COMMENT_IS_EDITABLE,
	COMMENT_QUICK_ACTIONS_POSSIBLE,
	COMMENT_THREAD_IS_NOT_RESOLVED,
	COMMENT_THREAD_IS_RESOLVED,
	LAST_COMMENT_WAS_DRAFT,
	OPEN_FILE_HAS_UNRESOLVED_COMMENTS,
	OPEN_FILE_IS_CHANGE_DIFF,
	OPEN_FILE_IS_PATCHSET_LEVEL_FILE,
	TREE_ITEM_CHANGE_CUSTOM_PATCHSET_SELECTION,
	TREE_ITEM_IS_CURRENT,
	TREE_ITEM_IS_NOT_CURRENT,
	TREE_ITEM_TYPE_CHANGE,
	TREE_ITEM_TYPE_FILE,
	TREE_ITEM_TYPE_QUICK_CHECKOUT,
	TREE_ITEM_WAS_MODIFIED,
} from '../lib/util/magic';
import {
	COMMENT_IS_EMPTY,
	contextProp,
	EDITOR_TEXT_FOCUS,
	IS_GERRIT_CHANGE_EXPLORER_VIEW,
	IS_GERRIT_QUICK_CHECKOUT_VIEW,
	IS_GERRIT_SEARCH_RESULTS_VIEW,
	IS_GERRTIT_COMMENT_CONTROLLER,
	resourceCtxContains,
	SCM_PROVIDER_IS_GIT,
} from './when-conditions';
import {
	and,
	commentContains,
	commentThreadContains,
	inParentheses,
	or,
	viewItemContains,
} from 'vscode-generate-package-json';
import { GerritExtensionCommands } from './command-names';

export const commands: {
	[K in GerritExtensionCommands]: {
		title: string;
		enablement?: string;
		icon?:
			| string
			| {
					dark: string;
					light: string;
			  };
		inCommandPalette: boolean | string;
		keybinding?: string | true;
	};
} = {
	'gerrit.changeGitRepo': {
		title: 'Change git repo',
		inCommandPalette: true,
	},
	'gerrit.ackCommentThread': {
		title: 'Ack',
		icon: '$(record)',
		inCommandPalette: false,
	},
	'gerrit.cancelComment': {
		title: 'Cancel',
		inCommandPalette: false,
	},
	'gerrit.checkConnection': {
		title: 'Check Connection',
		inCommandPalette: true,
	},
	'gerrit.checkoutBranch': {
		title: 'Checkout Change',
		inCommandPalette: false,
		icon: '$(arrow-down)',
	},
	'gerrit.clearSearchResults': {
		title: 'Clear search results',
		icon: '$(clear-all)',
		inCommandPalette: or(
			contextProp('gerrit:searchQuery'),
			contextProp('gerrit:searchChangeNumber')
		),
	},
	'gerrit.collapseAllComments': {
		title: 'Collapse All Comments',
		icon: '$(collapse-all)',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.configureChangeList': {
		title: 'Configure filters',
		icon: '$(gear)',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.copyCommentLink': {
		title: 'Copy weblink to this comment',
		icon: '$(link)',
		inCommandPalette: false,
	},
	'gerrit.createCommentResolved': {
		title: 'Save (resolved)',
		enablement: '!commentIsEmpty',
		inCommandPalette: false,
	},
	'gerrit.createCommentUnresolved': {
		title: 'Save (unresolved)',
		enablement: '!commentIsEmpty',
		inCommandPalette: false,
	},
	'gerrit.deleteComment': {
		title: 'Delete comment',
		icon: '$(trash)',
		inCommandPalette: false,
	},
	'gerrit.doneCommentThread': {
		title: 'Done',
		icon: '$(check)',
		inCommandPalette: false,
	},
	'gerrit.editComment': {
		title: 'Edit comment',
		icon: '$(edit)',
		inCommandPalette: false,
	},
	'gerrit.enterCredentials': {
		title: 'Enter credentials',
		inCommandPalette: true,
	},
	'gerrit.fetchMore': {
		title: 'Fetch More',
		inCommandPalette: false,
	},
	'gerrit.focusChange': {
		title: 'Focus Change In Change List Panel',
		inCommandPalette: false,
		keybinding: true,
	},
	'gerrit.listenForStreamEvents': {
		title: 'Start listening for Gerrit stream events',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.nextUnresolvedComment': {
		title: 'Next Unresolved Comment',
		icon: {
			dark: 'src/images/icons/comment-down-dark.svg',
			light: 'src/images/icons/comment-down-light.svg',
		},
		inCommandPalette: contextProp('gerrit:connected'),
		keybinding: EDITOR_TEXT_FOCUS,
	},
	'gerrit.openChangeOnline': {
		title: 'Open On Gerrit',
		inCommandPalette: false,
	},
	'gerrit.openChangeSelector': {
		title: 'Open Change Selector',
		inCommandPalette: contextProp('gerrit:connected'),
		keybinding: true,
	},
	'gerrit.checkoutChange': {
		title: 'Checkout change by ID or number',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.openCommentOnline': {
		title: 'Open comment on Gerrit',
		icon: '$(link-external)',
		inCommandPalette: false,
	},
	'gerrit.openCurrentOnline': {
		title: 'Open Current Change Online',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.openInReview': {
		title: 'Open in Review panel',
		icon: '$(open-preview)',
		inCommandPalette: false,
	},
	'gerrit.openModified': {
		title: 'Open Modified File',
		inCommandPalette: false,
	},
	'gerrit.openOnline': {
		title: 'Open On Gerrit',
		inCommandPalette: false,
	},
	'gerrit.openOriginal': {
		title: 'Open Original File',
		inCommandPalette: false,
	},
	'gerrit.openPatchsetSelector': {
		title: 'Open Patchset Selector',
		inCommandPalette: false,
	},
	'gerrit.previousUnresolvedComment': {
		title: 'Previous Unresolved Comment',
		icon: {
			dark: 'src/images/icons/comment-up-dark.svg',
			light: 'src/images/icons/comment-up-light.svg',
		},
		inCommandPalette: contextProp('gerrit:connected'),
		keybinding: EDITOR_TEXT_FOCUS,
	},
	'gerrit.pushForReview': {
		title: 'Push for Review',
		icon: '$(git-commit)',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.rebase': {
		title: 'Checkout & Rebase',
		inCommandPalette: false,
	},
	'gerrit.rebaseCurrent': {
		title: 'Rebase change',
		inCommandPalette: false,
	},
	'gerrit.recursiveRebase': {
		title: 'Checkout & Rebase recursively',
		inCommandPalette: false,
	},
	'gerrit.recursiveRebaseCurrent': {
		title: 'Checkout & Rebase recursively',
		inCommandPalette: false,
	},
	'gerrit.refreshChanges': {
		icon: '$(refresh)',
		title: 'Refresh changes',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.resetPatchsetSelection': {
		title: 'Reset Patchset Selection',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.search': {
		title: 'Search',
		icon: '$(search)',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.selectActiveView': {
		title: 'Select Active View',
		icon: '$(menu)',
		inCommandPalette: contextProp('gerrit:connected'),
	},
	'gerrit.toggleResolvedOff': {
		title: 'Unresolve thread',
		inCommandPalette: false,
	},
	'gerrit.toggleResolvedOn': {
		title: 'Resolve thread',
		inCommandPalette: false,
	},
	'gerrit.quickCheckout': {
		title: 'Quick Checkout',
		inCommandPalette: false,
		icon: '$(history)',
	},
	'gerrit.applyQuickCheckout': {
		title: "Apply Quick Checkout (don't drop)",
		inCommandPalette: false,
		icon: '$(arrow-down)',
	},
	'gerrit.dropQuickCheckouts': {
		title: 'Drop Quick Checkout stashes',
		inCommandPalette: true,
	},
	'gerrit.dropQuickCheckout': {
		title: 'Drop Quick Checkout Stash',
		inCommandPalette: false,
		icon: '$(trash)',
	},
	'gerrit.popQuickCheckout': {
		title: 'Pop Quick Checkout stash (apply and drop)',
		inCommandPalette: false,
	},
};

export const views: {
	[view: string]: {
		[groupName: string]: (
			| {
					command: GerritExtensionCommands;
					when?: string;
			  }
			| {
					submenu: string;
					when?: string;
					group?: string;
			  }
		)[];
	};
} = {
	'comments/comment/context': {
		newCommentButtons: [
			{
				command: GerritExtensionCommands.CREATE_COMMENT_UNRESOLVED,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
			{
				command: GerritExtensionCommands.CREATE_COMMENT_RESOLVED,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
			{
				command: GerritExtensionCommands.CANCEL_COMMENT,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
		],
	},
	'comments/commentThread/context': {
		newCommentButtons: [
			{
				command: GerritExtensionCommands.CREATE_COMMENT_UNRESOLVED,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
			{
				command: GerritExtensionCommands.CREATE_COMMENT_RESOLVED,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
			{
				command: GerritExtensionCommands.CANCEL_COMMENT,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
			{
				command: GerritExtensionCommands.RESOLVE_COMMENT,
				when: and(
					IS_GERRTIT_COMMENT_CONTROLLER,
					COMMENT_IS_EMPTY,
					commentThreadContains(LAST_COMMENT_WAS_DRAFT),
					commentThreadContains(COMMENT_THREAD_IS_NOT_RESOLVED)
				),
			},
			{
				command: GerritExtensionCommands.UNRESOLVE_COMMENT,
				when: and(
					IS_GERRTIT_COMMENT_CONTROLLER,
					COMMENT_IS_EMPTY,
					commentThreadContains(LAST_COMMENT_WAS_DRAFT),
					commentThreadContains(COMMENT_THREAD_IS_RESOLVED)
				),
			},
		],
	},
	'comments/commentThread/title': {
		collapse: [
			{
				command: GerritExtensionCommands.PREVIOUS_UNRESOLVED_COMMENT,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
			{
				command: GerritExtensionCommands.NEXT_UNRESOLVED_COMMENT,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
			{
				command: GerritExtensionCommands.COPY_COMMENT_LINK,
				when: and(
					IS_GERRTIT_COMMENT_CONTROLLER,
					contextProp('gerrit:hasCommentFeature')
				),
			},
			{
				command: GerritExtensionCommands.OPEN_COMMENT_ONLINE,
				when: and(
					IS_GERRTIT_COMMENT_CONTROLLER,
					contextProp('gerrit:hasCommentFeature')
				),
			},
			{
				command: GerritExtensionCommands.COLLAPSE_ALL_COMMENTS,
				when: IS_GERRTIT_COMMENT_CONTROLLER,
			},
		],
	},
	'comments/comment/title': {
		inline: [
			{
				command: GerritExtensionCommands.EDIT_COMMENT,
				when: and(
					IS_GERRTIT_COMMENT_CONTROLLER,
					commentContains(COMMENT_IS_EDITABLE)
				),
			},
			{
				command: GerritExtensionCommands.DONE_COMMENT_THREAD,
				when: and(
					IS_GERRTIT_COMMENT_CONTROLLER,
					commentContains(COMMENT_QUICK_ACTIONS_POSSIBLE)
				),
			},
			{
				command: GerritExtensionCommands.ACK_COMMENT_THREAD,
				when: and(
					IS_GERRTIT_COMMENT_CONTROLLER,
					commentContains(COMMENT_QUICK_ACTIONS_POSSIBLE)
				),
			},
			{
				command: GerritExtensionCommands.DELETE_COMMENT,
				when: and(
					IS_GERRTIT_COMMENT_CONTROLLER,
					commentContains(COMMENT_IS_DELETABLE)
				),
			},
		],
	},
	'view/item/context': {
		inline: [
			{
				command: GerritExtensionCommands.QUICK_CHECKOUT,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE)
				),
			},
			{
				command: GerritExtensionCommands.CHECKOUT_BRANCH,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE)
				),
			},
			{
				command: GerritExtensionCommands.DROP_QUICK_CHECKOUT,
				when: and(
					IS_GERRIT_QUICK_CHECKOUT_VIEW,
					viewItemContains(TREE_ITEM_TYPE_QUICK_CHECKOUT)
				),
			},
			{
				command: GerritExtensionCommands.QUICK_CHECKOUT_APPLY,
				when: and(
					IS_GERRIT_QUICK_CHECKOUT_VIEW,
					viewItemContains(TREE_ITEM_TYPE_QUICK_CHECKOUT)
				),
			},
		],
		openFile: [
			{
				command: GerritExtensionCommands.OPEN_CURRENT_CHANGE_ONLINE,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_FILE)
				),
			},
			{
				command: GerritExtensionCommands.FILE_OPEN_MODIFIED,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_FILE),
					viewItemContains(TREE_ITEM_WAS_MODIFIED)
				),
			},
			{
				command: GerritExtensionCommands.FILE_OPEN_ORIGINAL,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_FILE),
					viewItemContains(TREE_ITEM_WAS_MODIFIED)
				),
			},
		],
		change: [
			{
				command: GerritExtensionCommands.OPEN_IN_REVIEW,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE)
				),
			},
			{
				command: GerritExtensionCommands.OPEN_PATCHSET_SELECTOR,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE)
				),
			},
			{
				command: GerritExtensionCommands.RESET_PATCHSET_SELECTOR,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE),
					viewItemContains(TREE_ITEM_CHANGE_CUSTOM_PATCHSET_SELECTION)
				),
			},
		],
		achange: [
			{
				command: GerritExtensionCommands.CHECKOUT_BRANCH,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE)
				),
			},
			{
				command: GerritExtensionCommands.QUICK_CHECKOUT,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE)
				),
			},
			{
				command: GerritExtensionCommands.REBASE,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE),
					viewItemContains(TREE_ITEM_IS_NOT_CURRENT)
				),
			},
			{
				command: GerritExtensionCommands.REBASE_CURRENT,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE),
					viewItemContains(TREE_ITEM_IS_CURRENT)
				),
			},
			{
				command: GerritExtensionCommands.RECURSIVE_REBASE,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE),
					viewItemContains(TREE_ITEM_IS_NOT_CURRENT)
				),
			},
			{
				command: GerritExtensionCommands.RECURSIVE_REBASE_CURRENT,
				when: and(
					IS_GERRIT_CHANGE_EXPLORER_VIEW,
					viewItemContains(TREE_ITEM_TYPE_CHANGE),
					viewItemContains(TREE_ITEM_IS_CURRENT)
				),
			},
		],
		quickCheckout: [
			{
				command: GerritExtensionCommands.QUICK_CHECKOUT_APPLY,
				when: and(
					IS_GERRIT_QUICK_CHECKOUT_VIEW,
					viewItemContains(TREE_ITEM_TYPE_QUICK_CHECKOUT)
				),
			},
			{
				command: GerritExtensionCommands.QUICK_CHECKOUT_POP,
				when: and(
					IS_GERRIT_QUICK_CHECKOUT_VIEW,
					viewItemContains(TREE_ITEM_TYPE_QUICK_CHECKOUT)
				),
			},
			{
				command: GerritExtensionCommands.DROP_QUICK_CHECKOUT,
				when: and(
					IS_GERRIT_QUICK_CHECKOUT_VIEW,
					viewItemContains(TREE_ITEM_TYPE_QUICK_CHECKOUT)
				),
			},
		],
	},
	'view/title': {
		navigation: [
			{
				command: GerritExtensionCommands.CLEAR_SEARCH_RESULTS,
				when: and(
					inParentheses(
						or(
							IS_GERRIT_SEARCH_RESULTS_VIEW,
							IS_GERRIT_CHANGE_EXPLORER_VIEW
						)
					),
					inParentheses(
						or(
							contextProp('gerrit:searchQuery'),
							contextProp('gerrit:searchChangeNumber')
						)
					)
				),
			},
			{
				command: GerritExtensionCommands.SEARCH,
				when: or(
					IS_GERRIT_SEARCH_RESULTS_VIEW,
					IS_GERRIT_CHANGE_EXPLORER_VIEW
				),
			},
			{
				command: GerritExtensionCommands.REFRESH_CHANGES,
				when: and(
					contextProp('gerrit:connected'),
					IS_GERRIT_CHANGE_EXPLORER_VIEW
				),
			},
			{
				command: GerritExtensionCommands.SELECT_ACTIVE_VIEW,
				when: and(IS_GERRIT_CHANGE_EXPLORER_VIEW),
			},
			{
				command: GerritExtensionCommands.CONFIGURE_CHANGE_LIST,
				when: and(IS_GERRIT_CHANGE_EXPLORER_VIEW),
			},
		],
	},
	'editor/title': {
		navigation: [
			{
				command: GerritExtensionCommands.PREVIOUS_UNRESOLVED_COMMENT,
				when: or(
					resourceCtxContains(OPEN_FILE_IS_CHANGE_DIFF),
					resourceCtxContains(OPEN_FILE_HAS_UNRESOLVED_COMMENTS),
					resourceCtxContains(OPEN_FILE_IS_PATCHSET_LEVEL_FILE)
				),
			},
			{
				command: GerritExtensionCommands.NEXT_UNRESOLVED_COMMENT,
				when: or(
					resourceCtxContains(OPEN_FILE_IS_CHANGE_DIFF),
					resourceCtxContains(OPEN_FILE_HAS_UNRESOLVED_COMMENTS),
					resourceCtxContains(OPEN_FILE_IS_PATCHSET_LEVEL_FILE)
				),
			},
		],
	},
	'scm/title': {
		navigation: [
			{
				command: GerritExtensionCommands.PUSH_FOR_REVIEW,
				when: and(
					SCM_PROVIDER_IS_GIT,
					contextProp('gerrit:isUsingGerrit')
				),
			},
			{
				submenu: 'git.gerrit',
				when: and(
					SCM_PROVIDER_IS_GIT,
					contextProp('gerrit:isUsingGerrit')
				),
				group: '2_main@8',
			},
		],
	},
	'git.gerrit': {
		git_gerrit: [
			{
				command: GerritExtensionCommands.PUSH_FOR_REVIEW,
			},
			{
				command: GerritExtensionCommands.REBASE_CURRENT,
			},
			{
				command: GerritExtensionCommands.RECURSIVE_REBASE_CURRENT,
			},
		],
	},
};

export const commandDefinitions = GerritExtensionCommands;
