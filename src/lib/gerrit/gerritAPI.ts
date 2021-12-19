import { showInvalidSettingsMessage } from '../vscode/messages';
import { getGerritURL } from '../credentials/credentials';
import { getConfiguration } from '../vscode/config';
import { setContextProp } from '../vscode/context';
import { GerritAPI } from './gerritAPI/api';
import { log } from '../util/log';
import { window } from 'vscode';

let api: GerritAPI | null = null;
let lastConfig: {
	url: string | undefined;
	username: string | undefined;
	password: string | undefined;
} | null = null;

function hasSameConfig(
	url: string | undefined,
	username: string | undefined,
	password: string | undefined
): boolean {
	return (
		url === lastConfig?.url &&
		username === lastConfig?.username &&
		password === lastConfig?.password
	);
}

export async function checkConnection(): Promise<void> {
	const config = getConfiguration();
	const url = await getGerritURL();
	const username = config.get('gerrit.auth.username');
	const password = config.get('gerrit.auth.password');

	if (!url || !username || !password) {
		await showInvalidSettingsMessage(
			'Missing URL, username or password. Please set them in your settings. (gerrit.auth.{url|username|password})'
		);
		return;
	}

	const api = new GerritAPI(url, username, password);
	if (!(await api.testConnection())) {
		await showInvalidSettingsMessage(
			'Connection to Gerrit failed, please check your settings and/or connection'
		);
		return;
	}

	await window.showInformationMessage('Succesfully connected!');
}

export async function createAPI(): Promise<GerritAPI | null> {
	const config = getConfiguration();
	const url = await getGerritURL();
	const username = config.get('gerrit.auth.username');
	const password = config.get('gerrit.auth.password');

	if (!url || !username || !password) {
		await setContextProp('gerrit:connected', false);
		if (!hasSameConfig(url ?? undefined, username, password)) {
			log(
				'Missing URL, username or password. Please set them in your settings. (gerrit.auth.{url|username|password})'
			);
			await showInvalidSettingsMessage(
				'Missing Gerrit API connection settings. Please enter them using the "Gerrit credentials" command or in your settings file'
			);
		}
		lastConfig = {
			url: url ?? undefined,
			username,
			password,
		};
		return null;
	}

	const api = new GerritAPI(url, username, password);
	await setContextProp('gerrit:connected', true);
	return api;
}

export async function getAPI(): Promise<GerritAPI | null> {
	if (api) {
		return api;
	}

	return (api = await createAPI());
}

export async function getAPIForSubscription(): Promise<GerritAPI> {
	if (api) {
		return api;
	}

	api = await createAPI();
	if (api) {
		return new GerritAPI(null, null, null);
	}
	return api!;
}
