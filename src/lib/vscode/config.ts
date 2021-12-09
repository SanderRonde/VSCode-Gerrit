import {
	ConfigurationTarget,
	window,
	workspace,
	WorkspaceConfiguration,
} from 'vscode';

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

export interface ChangesView {
	title: string;
	panels: ChangesPanel[];
}

interface ConfigSettings {
	'gerrit.auth.url'?: string;
	'gerrit.auth.username'?: string;
	'gerrit.auth.password'?: string;
	'gerrit.selectedView': string;
	'gerrit.changesViews': ChangesView[];
	'gerrit.allowInvalidSSLCerts': boolean;
}

interface TypedWorkspaceConfiguration<T> extends WorkspaceConfiguration {
	get<K extends Extract<keyof T, string>>(
		section: K,
		defaultValue: T[K]
	): T[K];
	get<K extends Extract<keyof T, string>>(section: K): T[K];
	get<K extends Extract<keyof T, string>>(
		section: K,
		defaultValue?: T[K]
	): T[K];
	has<K extends Extract<keyof T, string>>(section: K): boolean;
	update<K extends Extract<keyof T, string>>(
		section: K,
		value: T[K],
		configurationTarget?: ConfigurationTarget | boolean | null,
		overrideInLanguage?: boolean
	): Thenable<void>;
}

export function getConfiguration(): TypedWorkspaceConfiguration<ConfigSettings> {
	const document = window.activeTextEditor?.document;

	if (document) {
		return workspace.getConfiguration(undefined, document.uri);
	}

	return workspace.getConfiguration();
}
