import { showInvalidSettingsMessage } from './messages';
import { getConfiguration } from './config';
import { GerritAPI } from './gerritAPI/api';
import { log } from './log';

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

export async function createAPI(): Promise<GerritAPI | null> {
	const config = getConfiguration();
	const url = config.get('gerrit.url');
	const username = config.get('gerrit.username');
	const password = config.get('gerrit.password');

	if (!url || !username || !password) {
		if (!hasSameConfig(url, username, password)) {
			log(
				'Missing URL, username or password. Please set them in your settings. (gerrit.{url|username|password})'
			);
			await showInvalidSettingsMessage(
				'Missing Gerrit API connection settings. Please enter them using the "Gerrit credentials" command or in your settings file'
			);
		}
		lastConfig = {
			url,
			username,
			password,
		};
		return null;
	}

	const api = new GerritAPI(url, username, password);
	return api;
}

export async function getAPI(): Promise<GerritAPI | null> {
	if (api) {
		return api;
	}

	return (api = await createAPI());
}
