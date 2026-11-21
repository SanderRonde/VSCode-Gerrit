import {
	GitReviewFile,
	getGitReviewFileCached,
} from '../credentials/gitReviewFile';
import { getConfiguration, getConfigurationWithLegacy } from '../vscode/config';
import { getGerritURLFromReviewFile } from '../credentials/enterCredentials';
import { showInvalidSettingsMessage } from '../vscode/messages';
import { Repository } from '../../types/vscode-extension-git';
import { GerritSecrets } from '../credentials/secrets';
import { Disposable, window, workspace } from 'vscode';
import { GerritUser } from './gerritAPI/gerritUser';
import { setContextProp } from '../vscode/context';
import { GerritAPI } from './gerritAPI/api';
import { log } from '../util/log';

let api: GerritAPI | null = null;
let failAllowedAPI: GerritAPI | null = null;
let gitReviewFile: GitReviewFile | null = null;
// Auth config the "missing settings" warning was last shown for
let lastWarnedConfigKey: string | null = null;
// Bumped whenever the cached API instances are dropped
let apiGeneration = 0;

interface AuthConfig {
	url: string | undefined;
	username: string | undefined;
	password: string | undefined;
	cookie: string | undefined;
	extraCookies: Record<string, string> | undefined;
}

function authConfigKey(config: AuthConfig): string {
	return JSON.stringify([
		config.url,
		config.username,
		config.password,
		config.cookie,
		config.extraCookies ?? null,
	]);
}

async function getAuthConfig(): Promise<AuthConfig> {
	const config = getConfiguration();
	const url = getGerritURLFromReviewFile(gitReviewFile) ?? undefined;
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
		username: config.get('gerrit.auth.username'),
		password: password ?? undefined,
		cookie: cookie ?? undefined,
		extraCookies: config.get('gerrit.extraCookies'),
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

async function createAPIFromConfig(
	authConfig: AuthConfig,
	allowFail: boolean
): Promise<GerritAPI | null> {
	const { url, username, password, cookie, extraCookies } = authConfig;
	const key = authConfigKey(authConfig);

	if (!url || ((!username || !password) && !cookie)) {
		await setContextProp('gerrit:connected', false);
		if (key !== lastWarnedConfigKey) {
			log(
				'Missing URL, username or password. Please set them in your settings. (gerrit.auth.{url|username|password})'
			);
			await showInvalidSettingsMessage(
				'Missing Gerrit API connection settings. Please enter them using the "Gerrit credentials" command or in your settings file'
			);
		}
		lastWarnedConfigKey = key;
		return null;
	}

	lastWarnedConfigKey = null;
	const api = new GerritAPI(
		url,
		username ?? null,
		password ?? null,
		cookie ?? null,
		extraCookies ?? null,
		gitReviewFile,
		allowFail
	);
	await setContextProp('gerrit:connected', true);
	return api;
}

export async function createAPI(
	allowFail: boolean = false
): Promise<GerritAPI | null> {
	return createAPIFromConfig(await getAuthConfig(), allowFail);
}

/**
 * Drops the cached API instances so the next `getAPI` call creates one
 * with the current URL/credentials.
 */
function resetAPI(): void {
	api = null;
	failAllowedAPI = null;
	apiGeneration++;
	// Credentials changed, we may be a different user now
	GerritUser.resetSelf();
}

/**
 * Recreate the API when the auth settings or stored secrets change.
 * Checking for changes on every `getAPI` call would mean reading the
 * secret storage on every request.
 */
export function initAPIConfigListener(): Disposable {
	return Disposable.from(
		workspace.onDidChangeConfiguration((e) => {
			if (
				e.affectsConfiguration('gerrit.auth') ||
				e.affectsConfiguration('gerrit.extraCookies')
			) {
				resetAPI();
			}
		}),
		GerritSecrets.secretStorage.onDidChange(() => resetAPI())
	);
}

export async function getAPI(
	allowFail: boolean = false
): Promise<GerritAPI | null> {
	const cached = allowFail ? failAllowedAPI : api;
	if (cached) {
		return cached;
	}

	const generation = apiGeneration;
	const newAPI = await createAPI(allowFail);
	if (generation !== apiGeneration) {
		// Config changed while creating, don't cache an outdated instance
		return newAPI;
	}
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
	return (
		(await getAPI(allowFail)) ??
		new GerritAPI(null, null, null, null, null, gitReviewFile, allowFail)
	);
}

// TODO: this is really hacky... Ideally we have explicit dependencies
// but at that point it becomes such as massive chain of dependencies
// that I'm not sure it helps...
export async function setAPIGitReviewFile(
	gerritRepo: Repository
): Promise<void> {
	const newGitReviewFile = await getGitReviewFileCached(gerritRepo);
	if (JSON.stringify(newGitReviewFile) !== JSON.stringify(gitReviewFile)) {
		resetAPI();
	}
	gitReviewFile = newGitReviewFile;
}
