import {
	GERRIT_CHANGE_EXPLORER_VIEW,
	GERRIT_QUICK_CHECKOUT_VIEW,
	GERRIT_SEARCH_RESULTS_VIEW,
} from '../lib/util/constants';
import { ContextProps } from '../lib/vscode/context';

export function isCommentController(controller: string): string {
	return `commentController == ${controller}`;
}

export function isView(view: string): string {
	return `view == ${view}`;
}

export const IS_GERRTIT_COMMENT_CONTROLLER = isCommentController('gerrit');
export const IS_GERRIT_CHANGE_EXPLORER_VIEW = isView(
	GERRIT_CHANGE_EXPLORER_VIEW
);
export const IS_GERRIT_QUICK_CHECKOUT_VIEW = isView(GERRIT_QUICK_CHECKOUT_VIEW);
export const IS_GERRIT_SEARCH_RESULTS_VIEW = isView(GERRIT_SEARCH_RESULTS_VIEW);
export const SCM_PROVIDER_IS_GIT = scmProviderContains('git');

export const EDITOR_TEXT_FOCUS = 'editorTextFocus';

export function and(...conditions: string[]): string {
	return conditions.join(' && ');
}

export function or(...conditions: string[]): string {
	return conditions.join(' || ');
}

export function inParentheses(condition: string): string {
	return `(${condition})`;
}

export const COMMENT_IS_EMPTY = 'commentIsEmpty';

export function contains(key: string, value: string): string {
	return `${key} =~ /${value}/`;
}

export function commentThreadContains(value: string): string {
	return contains('commentThread', value);
}

export function commentContains(value: string): string {
	return contains('comment', value);
}

export function viewItemContains(value: string): string {
	return contains('viewItem', value);
}

export function resourceContains(value: string): string {
	return contains('resource', value);
}

export function scmProviderContains(value: string): string {
	return contains('scmProvider', value);
}

export function contextProp(prop: keyof ContextProps): string {
	return prop;
}

export function resourceCtxContains(value: string): string {
	return resourceContains(`_ctx_${value}`);
}
