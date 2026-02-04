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

/**
 * Configuration that includes auth settings stored in plain text (not recommended).
 * Prefer "Gerrit: Enter credentials" for secure storage; these settings are still
 * supported for cases like devcontainers where the command is not practical.
 */
export function getConfigurationWithLegacy(): TypedWorkspaceConfiguration<
	ConfigSettings & {
		/** Not recommended: stored in plain text. Prefer the credentials command for secure storage. */
		'gerrit.auth.password'?: string;
		/** Not recommended: stored in plain text. Prefer the credentials command for secure storage. */
		'gerrit.auth.cookie'?: string;
	}
> {
	return getConfiguration();
}
