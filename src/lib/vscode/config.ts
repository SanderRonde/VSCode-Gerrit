import {
	GetConfigurationType,
	TypedWorkspaceConfiguration,
} from 'vscode-generate-package-json';
import { commands, window, workspace } from 'vscode';
import { config } from '../../commands/defs';

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

/** @deprecated */
export function getConfigurationWithLegacy(): TypedWorkspaceConfiguration<
	ConfigSettings & {
		/** @deprecated */
		'gerrit.auth.password'?: string;
		/** @deprecated */
		'gerrit.auth.cookie'?: string;
	}
> {
	return getConfiguration();
}
