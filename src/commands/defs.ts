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
	CommandDefinition,
	commentContains,
	commentThreadContains,
	ConfigurationDefinition,
	DefaultCodiconStrings,
	inParentheses,
	or,
	viewItemContains,
} from 'vscode-generate-package-json';
import { GerritExtensionCommands } from './command-names';
import { ExpandComments, ChangesView } from './types';

type LocalIcons =
	| 'src/images/icons/comment-down-dark.svg'
	| 'src/images/icons/comment-down-light.svg'
	| 'src/images/icons/comment-up-dark.svg'
	| 'src/images/icons/comment-up-light.svg';
export type GerritCodicons = DefaultCodiconStrings | LocalIcons;
export const commands: {
	[K in GerritExtensionCommands]: CommandDefinition<GerritCodicons>;
} = {
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
		title: 'Open online',
		inCommandPalette: false,
		icon: '$(globe)',
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
		title: 'Open file on Gerrit',
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
	'gerrit.openFileOnGitiles': {
		title: 'Open file on Gitiles',
		inCommandPalette: true,
	},
	'gerrit.openLineOnGitiles': {
		title: 'Open line on Gitiles',
		inCommandPalette: true,
	},
	'gerrit.openLineOnGitilesPermalink': {
		title: 'Open line on Gitiles (permalink)',
		inCommandPalette: true,
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
				command: GerritExtensionCommands.CHANGE_OPEN_ONLINE,
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
				command: GerritExtensionCommands.FILE_OPEN_ONLINE,
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
				command: GerritExtensionCommands.CHANGE_OPEN_ONLINE,
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
	'editor/lineNumber/context': {
		gerrit: [
			{
				command: GerritExtensionCommands.OPEN_LINE_ON_GITILES,
				submenu: 'gerrit/editor/lineNumber/context/gitiles',
			},
			{
				command: GerritExtensionCommands.OPEN_LINE_ON_GITILES_PERMALINK,
				submenu: 'gerrit/editor/lineNumber/context/gitiles',
			},
		],
	},
};

export const config = {
	'gerrit.streamEvents': {
		jsonDefinition: {
			type: 'boolean',
			title: "Enable listening for events by SSH'ing to Gerrit",
			description:
				"Enable listening for events by SSH'ing to Gerrit. See https://gerrit-review.googlesource.com/Documentation/cmd-stream-events.html for more info",
			default: false,
		},
	},
	'gerrit.messages.postReviewNotification': {
		jsonDefinition: {
			type: 'boolean',
			title: 'Show notification after running `git review`',
			description:
				'Show notification after running `git review` that allows you to either open the change online or in the review panel',
			default: true,
		},
	},
	'gerrit.quickCheckout.dropAllStashes': {
		jsonDefinition: {
			type: 'boolean',
			title: 'Drop all git stashes after dropping quick checkouts',
			description:
				'Drop all git stashes after dropping quick checkouts as well',
		},
	},
	'gerrit.quickCheckout.showInStatusBar': {
		jsonDefinition: {
			type: 'boolean',
			title: 'Show quick checkouts in statusbar',
			description:
				'Whether quick checkout stashes should be shown in the statusbar for quick access',
		},
	},
	'gerrit.remotes': {
		jsonDefinition: {
			type: 'object',
			title: 'Gerrit credentials',
			description:
				'Gerrit login credentials/settings for every gerrit remote (host) you have. If you don\'t know the remote names by hand, use the "Enter credentials" command. Use the `"default"` key for a shared/default.',
			properties: {
				username: {
					type: 'string',
					title: 'Gerrit username',
					description: 'Gerrit login username',
				},
				password: {
					type: 'string',
					title: 'Gerrit password',
					description:
						'Gerrit password (see https://{your_gerit_host}/settings/#HTTPCredentials)',
				},
				url: {
					type: 'string',
					title: 'URL of the REST API',
					description:
						'URL of the REST API. This is generally the same as the URL where your dashboard is hosted.',
				},
				cookie: {
					type: 'string',
					title: 'Gerrit cookie',
					description: 'Gerrit authentication cookie',
				},
				extraCookies: {
					type: 'object',
					title: 'Extra Gerrit cookies',
					description:
						'Other cookies besides the authentication cookie to send on every request',
					__shape: '' as unknown as Record<string, string>,
				},
			},
			examples: [
				{
					'gerrit.example.com': {
						username: 'username',
						password: 'password',
					},
				},
				{
					'example.com': {
						username: 'username',
						password: 'password',
						url: 'example.com/codereview',
					},
				},
				{
					default: {
						username: 'username',
					},
					'gerrit.example.com': {
						password: 'password',
					},
					'gerrit.otherExample.com': {
						password: 'password',
					},
				},
			],
			__shape: '' as unknown as Record<
				string,
				{
					username?: string;
					password?: string;
					cookie?: string;
					extraCookies?: Record<string, string>;
					url?: string;
				}
			>,
		},
	},
	// 'gerrit.urls': {
	// 	jsonDefinition: {
	// 		type: 'object',
	// 		title: 'Gerrit remote URLs by project path',
	// 		description:
	// 			'Gerrit remote URLs by project path. Use this if the host in your .gitreview file is not correct or not present.',
	// 		__shape: '' as unknown as Record<string, string>,
	// 	},
	// },
	// 'gerrit.auth.username': {
	// 	jsonDefinition: {
	// 		type: 'string',
	// 		title: 'Gerrit username',
	// 		description: 'Gerrit login username',
	// 	},
	// },
	// 'gerrit.auth.password': {
	// 	jsonDefinition: {
	// 		type: 'string',
	// 		title: 'Gerrit password',
	// 		description:
	// 			'Gerrit password (see https://{your_gerit_host}/settings/#HTTPCredentials)',
	// 	},
	// },
	// 'gerrit.auth.cookie': {
	// 	jsonDefinition: {
	// 		type: 'string',
	// 		title: 'Gerrit cookie',
	// 		description: 'Gerrit authentication cookie',
	// 	},
	// },
	// 'gerrit.extraCookies': {
	// 	jsonDefinition: {
	// 		type: 'object',
	// 		title: 'Extra Gerrit cookies',
	// 		__shape: '' as unknown as Record<string, string>,
	// 		description:
	// 			'Other cookies besides the authentication cookie to send on every request',
	// 	},
	// },
	// 'gerrit.auth.url': {
	// 	jsonDefinition: {
	// 		type: 'string',
	// 		title: 'URL of the gerrit server to use',
	// 		description:
	// 			'URL of the gerrit server to use (inferred from `.gitreview` if not provided). Uses HTTPS if no scheme is provided',
	// 	},
	// },
	'gerrit.selectedView': {
		jsonDefinition: {
			type: 'string',
			title: 'Active changes view',
			description:
				'Active changes view, one of the titles in "gerrit.changesViews"',
			default: 'Dashboard',
		},
	},
	'gerrit.expandComments': {
		jsonDefinition: {
			type: 'string',
			enum: [
				ExpandComments.ALWAYS,
				ExpandComments.UNRESOLVED,
				ExpandComments.NEVER,
			],
			default: ExpandComments.UNRESOLVED,
			description: 'When inline comments should be expanded',
		},
	},
	'gerrit.changeTitleTemplate': {
		jsonDefinition: {
			type: 'object',
			description:
				'Templates for showing the titles of changes in the CHANGES view. Use ${number}, ${subject/title}, ${owner}, ${repo}, ${branch}, ${status} as templates.',

			properties: {
				title: {
					type: 'string',
					description: 'Title of change, shown first in white text',
					examples: [
						'${number}: ${subject} (${owner})',
						'${number}: ${subject} (${owner}/${repo}/${branch})',
						'${number}: ${subject} (${owner}/${repo}/${branch}/${status})',
					],
					default: '#${number}: ${subject}',
				},
				subtitle: {
					type: 'string',
					description:
						'Subtitle of change, shown behind title in grey text',
					examples: [
						'by ${owner}',
						'($owner)',
						'${owner}/${repo}/${branch}',
						'${owner}/${repo}/${branch}/${status}',
					],
					default: 'by ${owner}',
				},
			},
			default: {
				title: '#${number}: ${subject}',
				subtitle: 'by ${owner}',
			},
		},
	},
	'gerrit.forceEnable': {
		jsonDefinition: {
			type: 'boolean',
			default: false,
			description:
				'Force enable gerrit extension even for unsupported versions',
		},
	},
	'gerrit.filterByProject': {
		jsonDefinition: {
			type: 'boolean',
			default: true,
			description: 'Filter all changes by the current project',
		},
	},
	'gerrit.changesViews': {
		jsonDefinition: {
			type: 'array',
			title: 'Changes views',
			description:
				'A set of changes views. You can choose the currently selected view in the CHANGES view',
			minItems: 1,
			__shape: '' as unknown as ChangesView[],
			items: {
				type: 'object',
				title: 'View',
				description:
					'A single changes view similar to your Gerrit dashboard',
				required: ['title', 'panels'],
				properties: {
					title: {
						type: 'string',
						description: 'Name of this view',
					},
					panels: {
						type: 'array',
						title: 'Panels',
						description: 'Panels in a changes view',
						items: {
							type: 'object',
							title: 'Pane',
							description:
								'One pane in the changes view. These can be collapsed or expanded',
							required: ['title', 'filters'],
							properties: {
								title: {
									type: 'string',
									title: 'Title of the pane',
								},
								refreshInterval: {
									type: 'number',
									title: 'Refresh interval (in seconds)',
									description:
										'Interval at which the entire pane is refreshed. Use 0 for no auto-refreshing',
									default: 300,
								},
								defaultCollapsed: {
									type: 'boolean',
									title: 'Whether this pane should be collapsed by default',
									default: false,
								},
								initialFetchCount: {
									type: 'number',
									title: 'Fetch count',
									description:
										'How many entries to fetch initially',
									default: 25,
								},
								extraEntriesFetchCount: {
									type: 'number',
									title: 'Extra entries to fetch',
									description:
										'Extra entries to fetch on clicking "fetch more"',
									default: 25,
								},
								filters: {
									type: 'array',
									title: 'Filters',
									description:
										'Filters to apply to the search, see Gerrit docs: https://gerrit-review.googlesource.com/Documentation/user-search.html',
									minItems: 1,
									items: {
										type: 'string',
										title: 'Filter',
										description:
											'Gerrit filter to use. See Gerrit docs: https://gerrit-review.googlesource.com/Documentation/user-search.html',
									},
									default: ['is:open', 'owner:self'],
								},
							},
							examples: [
								{
									title: 'Your Turn',
									refreshInterval: 300,
									defaultCollapsed: false,
									initialFetchCount: 25,
									extraEntriesFetchCount: 25,
									filters: ['attention:self'],
								},
								{
									title: 'Work In Progress',
									refreshInterval: 300,
									defaultCollapsed: false,
									initialFetchCount: 25,
									extraEntriesFetchCount: 25,
									filters: [
										'is:open',
										'owner:self',
										'is:wip',
									],
								},
								{
									title: 'Outgoing Reviews',
									refreshInterval: 300,
									defaultCollapsed: false,
									initialFetchCount: 25,
									extraEntriesFetchCount: 25,
									filters: [
										'is:open',
										'owner:self',
										'-is:wip',
									],
								},
								{
									title: 'Incoming Reviews',
									refreshInterval: 300,
									defaultCollapsed: false,
									initialFetchCount: 25,
									extraEntriesFetchCount: 25,
									filters: [
										'is:open',
										'-owner:self',
										'-is:wip',
										'reviewer:self',
									],
								},
								{
									title: 'CCed on',
									refreshInterval: 300,
									defaultCollapsed: false,
									initialFetchCount: 25,
									extraEntriesFetchCount: 25,
									filters: ['is:open', 'cc:self'],
								},
								{
									title: 'Recently Closed',
									refreshInterval: 1500,
									defaultCollapsed: true,
									initialFetchCount: 10,
									extraEntriesFetchCount: 25,
									filters: [
										'is:closed',
										'-is:wip OR owner:self',
										'owner:self OR reviewer:self OR cc:self',
									],
								},
							],
						},
					},
				},
			},
			default: [
				{
					title: 'Dashboard',
					panels: [
						{
							title: 'Your Turn',
							refreshInterval: 300,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: ['attention:self'],
						},
						{
							title: 'Work In Progress',
							refreshInterval: 300,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: ['is:open', 'owner:self', 'is:wip'],
						},
						{
							title: 'Outgoing Reviews',
							refreshInterval: 300,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: ['is:open', 'owner:self', '-is:wip'],
						},
						{
							title: 'Incoming Reviews',
							refreshInterval: 300,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: [
								'is:open',
								'-owner:self',
								'-is:wip',
								'reviewer:self',
							],
						},
						{
							title: 'CCed on',
							refreshInterval: 300,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: ['is:open', 'cc:self'],
						},
						{
							title: 'Recently Closed',
							refreshInterval: 1500,
							defaultCollapsed: true,
							initialFetchCount: 10,
							extraEntriesFetchCount: 25,
							filters: [
								'is:closed',
								'-is:wip OR owner:self',
								'owner:self OR reviewer:self OR cc:self',
							],
						},
					],
				},
				{
					title: 'Starred',
					panels: [
						{
							title: 'Starred',
							refreshInterval: 500,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: ['is:starred'],
						},
					],
				},
				{
					title: 'Watched',
					panels: [
						{
							title: 'Watched',
							refreshInterval: 500,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: ['is:watched', 'is:open'],
						},
					],
				},
				{
					title: 'Draft',
					panels: [
						{
							title: 'Draft',
							refreshInterval: 500,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: ['has:draft'],
						},
					],
				},
				{
					title: 'My Changes',
					panels: [
						{
							title: 'My Changes',
							refreshInterval: 500,
							defaultCollapsed: false,
							initialFetchCount: 25,
							extraEntriesFetchCount: 25,
							filters: ['is:open', 'owner:self'],
						},
					],
				},
			],
		},
	},
	'gerrit.allowInvalidSSLCerts': {
		jsonDefinition: {
			type: 'boolean',
			title: 'Allow requests to failed/invalid SSL certs',
			description:
				'Note: before you use this, ask your server maintainer to fix their certs. This option can can be dangerous.',
			default: false,
		},
	},
	'gerrit.customAuthUrlPrefix': {
		jsonDefinition: {
			type: 'string',
			title: 'Add a custom prefix to use for authenticated links',
			description:
				'Changes the default authentication prefix from "a/" to a custom string. This should only be necessary if using a non-standard gerrit instance.',
			default: 'a/',
		},
	},
} as const;

export const commandDefinitions = GerritExtensionCommands;

export const configuration = config as Record<string, ConfigurationDefinition>;
