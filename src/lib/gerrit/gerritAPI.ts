import {
	GitReviewFile,
	getGitReviewFileCached,
} from '../credentials/gitReviewFile';
import { getConfiguration, getConfigurationWithLegacy } from '../vscode/config';
import { getGerritURLFromReviewFile } from '../credentials/enterCredentials';
import { showInvalidSettingsMessage } from '../vscode/messages';
import { Repository } from '../../types/vscode-extension-git';
import { GerritSecrets } from '../credentials/secrets';
import { GerritUser } from './gerritAPI/gerritUser';
import { setContextProp } from '../vscode/context';
import { GerritAPI } from './gerritAPI/api';
import { window, workspace } from 'vscode';
import { log } from '../util/log';

let api: GerritAPI | null = null;
let failAllowedAPI: GerritAPI | null = null;
let lastConfig: {
	url: string | undefined;
	username: string | undefined;
	password: string | undefined;
	cookie: string | undefined;
	extraCookies: string;
} | null = null;
let gitReviewFile: GitReviewFile | null = null;

function extraCookiesKey(
	extraCookies: Record<string, string> | undefined | null
): string {
	return JSON.stringify(extraCookies ?? null);
}

function hasSameConfig(
	url: string | undefined,
	username: string | undefined,
	password: string | undefined,
	cookie: string | undefined,
	extraCookies: Record<string, string> | undefined | null
): boolean {
	return (
		url === lastConfig?.url &&
		username === lastConfig?.username &&
		password === lastConfig?.password &&
		cookie === lastConfig?.cookie &&
		extraCookiesKey(extraCookies) === lastConfig?.extraCookies
	);
}

function rememberConfig(
	url: string | undefined,
	username: string | undefined,
	password: string | undefined,
	cookie: string | undefined,
	extraCookies: Record<string, string> | undefined | null
): void {
	lastConfig = {
		url,
		username,
		password,
		cookie,
		extraCookies: extraCookiesKey(extraCookies),
	};
}

export async function checkConnection(): Promise<void> {
	const config = getConfigurationWithLegacy();
	const url = getGerritURLFromReviewFile(gitReviewFile);
	const username = config.get('gerrit.auth.username');
	const password = await GerritSecrets.getForUrlOrWorkspace(
		'password',
		url ?? undefined,
		workspace.workspaceFolders?.[0]?.uri
	);
	const cookie = await GerritSecrets.getForUrlOrWorkspace(
		'cookie',
		url ?? undefined,
		workspace.workspaceFolders?.[0]?.uri
	);
	const extraCookies = config.get('gerrit.extraCookies');

	if (!url || ((!username || !password) && !cookie)) {
		await showInvalidSettingsMessage(
			'Missing URL, username or password. Please set them in your settings. (gerrit.auth.{url|username|password})'
		);
		return;
	}

	const api = new GerritAPI(
		url,
		username ?? null,
		password ?? null,
		cookie ?? null,
		extraCookies ?? null,
		gitReviewFile
	);
	const connection = api.testConnection();
	if (!(await connection.exists)) {
		await showInvalidSettingsMessage(
			'Connection to Gerrit failed, please check your settings and/or connection',
			[
				{
					title: 'Show cURL command',
					callback: () =>
						connection.runCurlCommand({
							forExists: true,
							forAuthenticated: false,
						}),
				},
			]
		);
		return;
	} else if (!(await connection.authenticated)) {
		await showInvalidSettingsMessage(
			'Gerrit authentication failed, please check your credentials',
			[
				{
					title: 'Show cURL command',
					callback: () =>
						connection.runCurlCommand({
							forExists: true,
							forAuthenticated: true,
						}),
				},
			]
		);
		return;
	}

	await window.showInformationMessage(
		'Succesfully connected and authenticated!'
	);
}

export async function createAPI(
	allowFail: boolean = false
): Promise<GerritAPI | null> {
	const config = getConfiguration();
	const url = getGerritURLFromReviewFile(gitReviewFile);
	const username = config.get('gerrit.auth.username');
	const password = await GerritSecrets.getForUrlOrWorkspace(
		'password',
		url ?? undefined,
		workspace.workspaceFolders?.[0]?.uri
	);
	const cookie = await GerritSecrets.getForUrlOrWorkspace(
		'cookie',
		url ?? undefined,
		workspace.workspaceFolders?.[0]?.uri
	);
	const extraCookies = config.get('gerrit.extraCookies');

	if (!url || ((!username || !password) && !cookie)) {
		await setContextProp('gerrit:connected', false);
		if (
			!hasSameConfig(
				url ?? undefined,
				username,
				password ?? undefined,
				cookie ?? undefined,
				extraCookies
			)
		) {
			log(
				'Missing URL, username or password. Please set them in your settings. (gerrit.auth.{url|username|password})'
			);
			await showInvalidSettingsMessage(
				'Missing Gerrit API connection settings. Please enter them using the "Gerrit credentials" command or in your settings file'
			);
		}
		rememberConfig(
			url ?? undefined,
			username,
			password ?? undefined,
			cookie ?? undefined,
			extraCookies
		);
		return null;
	}

	const api = new GerritAPI(
		url,
		username ?? null,
		password ?? null,
		cookie ?? null,
		extraCookies ?? null,
		gitReviewFile,
		allowFail
	);
	rememberConfig(
		url ?? undefined,
		username,
		password ?? undefined,
		cookie ?? undefined,
		extraCookies
	);
	await setContextProp('gerrit:connected', true);
	return api;
}

function credentialsMatchCached(
	url: string | undefined,
	username: string | undefined,
	password: string | undefined,
	cookie: string | undefined,
	extraCookies: Record<string, string> | undefined | null
): boolean {
	return hasSameConfig(url, username, password, cookie, extraCookies);
}

async function getAuthSnapshot(): Promise<{
	url: string | undefined;
	username: string | undefined;
	password: string | undefined;
	cookie: string | undefined;
	extraCookies: Record<string, string> | undefined;
}> {
	const config = getConfiguration();
	const url = getGerritURLFromReviewFile(gitReviewFile) ?? undefined;
	const username = config.get('gerrit.auth.username');
	const password = await GerritSecrets.getForUrlOrWorkspace(
		'password',
		url,
		workspace.workspaceFolders?.[0]?.uri
	);
	const cookie = await GerritSecrets.getForUrlOrWorkspace(
		'cookie',
		url,
		workspace.workspaceFolders?.[0]?.uri
	);
	return {
		url,
		username,
		password: password ?? undefined,
		cookie: cookie ?? undefined,
		extraCookies: config.get('gerrit.extraCookies'),
	};
}

export async function getAPI(
	allowFail: boolean = false
): Promise<GerritAPI | null> {
	const snapshot = await getAuthSnapshot();
	const cached = allowFail ? failAllowedAPI : api;
	if (
		cached &&
		credentialsMatchCached(
			snapshot.url,
			snapshot.username,
			snapshot.password,
			snapshot.cookie,
			snapshot.extraCookies
		)
	) {
		return cached;
	}

	if (cached) {
		GerritUser.resetSelf();
	}

	const newAPI = await createAPI(allowFail);
	if (allowFail) {
		failAllowedAPI = newAPI;
	} else {
		api = newAPI;
	}
	return newAPI;
}

export async function getAPIForSubscription(
	allowFail: boolean = false
): Promise<GerritAPI> {
	const snapshot = await getAuthSnapshot();
	const cached = allowFail ? failAllowedAPI : api;
	if (
		cached &&
		credentialsMatchCached(
			snapshot.url,
			snapshot.username,
			snapshot.password,
			snapshot.cookie,
			snapshot.extraCookies
		)
	) {
		return cached;
	}

	if (cached) {
		GerritUser.resetSelf();
	}

	const newAPI = await createAPI(allowFail);
	if (!newAPI) {
		return new GerritAPI(
			null,
			null,
			null,
			null,
			null,
			gitReviewFile,
			allowFail
		);
	}
	if (allowFail) {
		failAllowedAPI = newAPI;
	} else {
		api = newAPI;
	}
	return newAPI;
}

// TODO: this is really hacky... Ideally we have explicit dependencies
// but at that point it becomes such as massive chain of dependencies
// that I'm not sure it helps...
export async function setAPIGitReviewFile(
	gerritRepo: Repository
): Promise<void> {
	gitReviewFile = await getGitReviewFileCached(gerritRepo);
}
