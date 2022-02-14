import {
	GERRIT_CHANGE_EXPLORER_VIEW,
	GERRIT_QUICK_CHECKOUT_VIEW,
	GERRIT_SEARCH_RESULTS_VIEW,
} from '../lib/util/constants';
import {
	isView,
	resourceContains,
	scmProviderContains,
} from 'vscode-generate-package-json';
import { ContextProps } from '../lib/vscode/context';

export function isCommentController(controller: string): string {
	return `commentController == ${controller}`;
}

export const IS_GERRTIT_COMMENT_CONTROLLER = isCommentController('gerrit');
export const IS_GERRIT_CHANGE_EXPLORER_VIEW = isView(
	GERRIT_CHANGE_EXPLORER_VIEW
);
export const IS_GERRIT_QUICK_CHECKOUT_VIEW = isView(GERRIT_QUICK_CHECKOUT_VIEW);
export const IS_GERRIT_SEARCH_RESULTS_VIEW = isView(GERRIT_SEARCH_RESULTS_VIEW);
export const SCM_PROVIDER_IS_GIT = scmProviderContains('git');

export const EDITOR_TEXT_FOCUS = 'editorTextFocus';
export const COMMENT_IS_EMPTY = 'commentIsEmpty';

export function contextProp(prop: keyof ContextProps): string {
	return prop;
}

export function resourceCtxContains(value: string): string {
	return resourceContains(`_ctx_${value}`);
}
