import {
	commands,
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

export enum ExpandComments {
	ALWAYS = 'always',
	NEVER = 'never',
	UNRESOLVED = 'unresolved',
}

interface ConfigSettings {
	'gerrit.auth.url'?: string;
	'gerrit.auth.username'?: string;
	'gerrit.auth.password'?: string;
	'gerrit.auth.cookie'?: string;
	'gerrit.extraCookies'?: Record<string, string>;
	'gerrit.selectedView': string;
	'gerrit.gerrit.expandComments': ExpandComments;
	'gerrit.changesViews': ChangesView[];
	'gerrit.filterByProject': boolean;
	'gerrit.allowInvalidSSLCerts': boolean;
	'gerrit.localGitRepoUri': string;
	'gerrit.messages.postReviewNotification': boolean;
	'gerrit.quickCheckout.dropAllStashes': boolean;
	'gerrit.quickCheckout.showInStatusBar': boolean;
	'gerrit.customAuthUrlPrefix': string;
	'gerrit.streamEvents': boolean;
	'gerrit.forceEnable': boolean;
	'gerrit.gitRepo'?: string;
	'gerrit.changeTitleTemplate': {
		title: string;
		subtitle: string;
	};
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

export function initConfigListener(): void {
	workspace.onDidChangeConfiguration(async (e) => {
		if (e.affectsConfiguration('gerrit.gitRepo')) {
			const RELOAD_OPTION = 'Reload';
			const choice = await window.showInformationMessage(
				'Gerrit: Please reload the extension to apply changes',
				RELOAD_OPTION
			);
			if (choice === RELOAD_OPTION) {
				await commands.executeCommand('workbench.action.reloadWindow');
			}
		}
	});
}
