import {
	GetConfigurationType,
	TypedWorkspaceConfiguration,
} from 'vscode-generate-package-json';
import { config } from '../../commands/defs';
import { window, workspace } from 'vscode';

export enum GerritChangesView {
	DASHBOARD = 'dashboard',
	MY_CHANGES = 'my changes',
	DRAFT = 'draft',
	WATCHED = 'watched',
	STARRED = 'starred',
}

export interface ChangesPanel {
	title: string;
	refreshInterval?: number;
	defaultCollapsed?: boolean;
	initialFetchCount?: number;
	extraEntriesFetchCount?: number;
	filters: string[];
}

export type ConfigSettings = GetConfigurationType<typeof config>;

export function getConfiguration(): TypedWorkspaceConfiguration<ConfigSettings> {
	const document = window.activeTextEditor?.document;

	if (document) {
		return workspace.getConfiguration(undefined, document.uri);
	}

	return workspace.getConfiguration();
}

/** @deprecated */
export function getConfigurationWithLegacy(): TypedWorkspaceConfiguration<
	ConfigSettings & {
		/** @deprecated */
		'gerrit.auth.username'?: string;
		/** @deprecated */
		'gerrit.auth.password'?: string;
		/** @deprecated */
		'gerrit.auth.cookie'?: string;
		/** @deprecated */
		'gerrit.auth.url'?: string;
		/** @deprecated */
		'gerrit.extraCookies'?: Record<string, string>;
	}
> {
	return getConfiguration();
}
