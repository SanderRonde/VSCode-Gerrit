import {
	ConfigurationTarget,
	env,
	QuickInputButton,
	ThemeIcon,
	Uri,
	window,
} from 'vscode';
import {
	GitReviewFile,
	getGitReviewFile,
	getGitReviewFileCached,
} from './gitReviewFile';
import { MultiStepEntry, MultiStepper } from '../vscode/multiStep';
import { Repository } from '../../types/vscode-extension-git';
import { GerritAPI } from '../gerrit/gerritAPI/api';
import { getConfiguration } from '../vscode/config';
import got from 'got/dist/source';

function applyTrailingSlashFix(url: string): string {
	if (url.endsWith('/')) {
		return url.substring(0, url.length - 1);
	}
	return url;
}

function applySchemeFix(url: string): string {
	if (!url.includes('://')) {
		return `https://${url}`;
	}

	return url;
}

function sanitizeURL(url: string): string {
	return applySchemeFix(applyTrailingSlashFix(url));
}

export function getGerritURLFromReviewFile(
	gitReviewFile: GitReviewFile | null
): string | null {
	const config = getConfiguration();
	const configuredValue = config.get('gerrit.auth.url');
	if (configuredValue) {
		return sanitizeURL(configuredValue);
	}
	if (gitReviewFile) {
		return sanitizeURL(gitReviewFile.host);
	}
	return null;
}

export async function getGerritURL(
	gerritRepo: Repository
): Promise<string | null> {
	const config = getConfiguration();
	const configuredValue = config.get('gerrit.auth.url');
	if (configuredValue) {
		return sanitizeURL(configuredValue);
	}
	const gitReviewFile = await getGitReviewFileCached(gerritRepo);
	if (gitReviewFile) {
		return sanitizeURL(gitReviewFile.host);
	}
	return null;
}

const VIEW_CURL_CMD_BUTTON: QuickInputButton = {
	tooltip: 'View cURL command',
	iconPath: new ThemeIcon('code'),
};

async function enterBasicCredentials(gerritRepo: Repository): Promise<void> {
	const config = getConfiguration();
	const initialURLValue = await getGerritURL(gerritRepo);
	const extraCookies = config.get('gerrit.extraCookies');

	const urlStep = new MultiStepEntry({
		placeHolder: 'https://gerrithost.com',
		prompt: 'Enter the URL of your Gerrit server',
		value: initialURLValue ?? undefined,
		validate: async (url: string) => {
			try {
				await got(url);
				return { isValid: true };
			} catch (e) {
				return {
					isValid: false,
					message: `Failed to reach URL: "${e as string}""`,
				};
			}
		},
	});
	const usernameStep = new MultiStepEntry({
		placeHolder: 'myuser',
		prompt: 'Enter your Gerrit username',
		value: config.get('gerrit.auth.username'),
	});
	const passwordStep = new MultiStepEntry({
		placeHolder: 'password',
		prompt: (stepper) =>
			`Enter your Gerrit password (see ${
				stepper.values[0] ?? 'www.yourgerrithost.com'
			}/settings/#HTTPCredentials)`,
		value: config.get('gerrit.auth.password'),
		isPassword: true,
		buttons: (stepper) => [
			{
				button: {
					iconPath: new ThemeIcon('globe'),
					tooltip: 'View online',
				},
				callback: () => {
					void env.openExternal(
						Uri.parse(
							`${stepper.values[0] ?? 'www.yourgerrithost.com'}/settings/#HTTPCredentials`
						)
					);
				},
			},
		],
		validate: async (password, stepper) => {
			const [url, username] = stepper.values;
			if (!url) {
				return {
					isValid: false,
					message: 'Missing URL',
				};
			}
			if (!username) {
				return {
					isValid: false,
					message: 'Missing username',
				};
			}

			const api = new GerritAPI(
				url,
				username,
				password,
				null,
				extraCookies ?? null,
				await getGitReviewFile(gerritRepo)
			);
			const connection = await api.testConnection();
			const viewCurlCmd = {
				button: VIEW_CURL_CMD_BUTTON,
				callback: connection.runCurlCommand,
			};
			if (!connection.exists) {
				return {
					isValid: false,
					message: 'Connection failed, invalid URL',
					buttons: [viewCurlCmd],
				};
			} else if (!connection.authenticated) {
				return {
					isValid: false,
					message: 'Authentication failed, invalid credentials',
					buttons: [viewCurlCmd],
				};
			}

			return { isValid: true };
		},
	});
	const result = await new MultiStepper([
		urlStep,
		usernameStep,
		passwordStep,
	]).run();

	if (result === undefined) {
		// User quit
		return;
	}

	const [url, username, password] = result;
	await Promise.all([
		url && url !== initialURLValue
			? config.update('gerrit.auth.url', url, ConfigurationTarget.Global)
			: Promise.resolve(),
		username
			? config.update(
					'gerrit.auth.username',
					username,
					ConfigurationTarget.Global
				)
			: Promise.resolve(),
		password
			? config.update(
					'gerrit.auth.password',
					password,
					ConfigurationTarget.Global
				)
			: Promise.resolve(),
	]);

	await window.showInformationMessage('Gerrit connection successful!');
}

async function enterCookieCredentials(gerritRepo: Repository): Promise<void> {
	const config = getConfiguration();
	const initialURLValue = await getGerritURL(gerritRepo);
	const extraCookies = config.get('gerrit.extraCookies');

	const urlStep = new MultiStepEntry({
		placeHolder: 'https://gerrithost.com',
		prompt: 'Enter the URL of your Gerrit server',
		value: initialURLValue ?? undefined,
		validate: async (url: string) => {
			try {
				await got(url);
				return { isValid: true };
			} catch (e) {
				return {
					isValid: false,
					message: `Failed to reach URL: "${e as string}""`,
				};
			}
		},
	});
	const cookieStep = new MultiStepEntry({
		placeHolder: '34-char-long alphanumeric string',
		prompt: (stepper) =>
			`Enter your Gerrit authentication cookie (go to ${
				stepper.values[0] ?? 'www.yourgerrithost.com'
			} and copy the value of the GerritAccount cookie)`,
		value: config.get('gerrit.auth.cookie'),
		validate: async (cookie, stepper) => {
			const [url] = stepper.values;
			if (!url) {
				return {
					isValid: false,
					message: 'Missing URL',
				};
			}

			const api = new GerritAPI(
				url,
				null,
				null,
				cookie,
				extraCookies ?? null,
				await getGitReviewFile(gerritRepo)
			);
			const connection = await api.testConnection();
			const viewCurlCmd = {
				button: VIEW_CURL_CMD_BUTTON,
				callback: connection.runCurlCommand,
			};
			if (!connection.exists) {
				return {
					isValid: false,
					message: 'Connection failed, invalid URL',
					buttons: [viewCurlCmd],
				};
			} else if (!connection.authenticated) {
				return {
					isValid: false,
					message: 'Authentication failed, invalid cookie,',
					buttons: [viewCurlCmd],
				};
			}

			return { isValid: true };
		},
	});
	const result = await new MultiStepper([urlStep, cookieStep]).run();

	if (result === undefined) {
		// User quit
		return;
	}

	const [url, cookie] = result;
	await Promise.all([
		url && url !== initialURLValue
			? config.update('gerrit.auth.url', url, ConfigurationTarget.Global)
			: Promise.resolve(),
		cookie
			? config.update(
					'gerrit.auth.cookie',
					cookie,
					ConfigurationTarget.Global
				)
			: Promise.resolve(),
	]);

	await window.showInformationMessage('Gerrit connection successful!');
}

export async function enterCredentials(gerritRepo: Repository): Promise<void> {
	const choice = await window.showQuickPick(
		[
			{
				label: 'Enter username and password',
			},
			{
				label: 'Enter cookie',
			},
		] as const,
		{
			ignoreFocusOut: true,
			placeHolder: 'How do you want to authenticate?',
			title: 'Gerrit Authentication',
		}
	);

	if (choice?.label === 'Enter username and password') {
		await enterBasicCredentials(gerritRepo);
	} else {
		await enterCookieCredentials(gerritRepo);
	}
}
