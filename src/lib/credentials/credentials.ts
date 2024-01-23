import { MultiStepEntry, MultiStepper } from '../vscode/multiStep';
import { getGitReviewFileCached } from './gitReviewFile';
import { ConfigurationTarget, window } from 'vscode';
import { getConfiguration } from '../vscode/config';
import { GerritAPI } from '../gerrit/gerritAPI/api';
import { optionalArrayEntry } from '../util/util';
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

export async function getGerritURL(): Promise<string | null> {
	const config = getConfiguration();
	const configuredValue = config.get('gerrit.auth.url');
	if (configuredValue) {
		return sanitizeURL(configuredValue);
	}
	const gitReviewFile = await getGitReviewFileCached();
	if (gitReviewFile) {
		return sanitizeURL(gitReviewFile.host);
	}
	return null;
}

async function enterBasicCredentials(): Promise<void> {
	const config = getConfiguration();
	const initialURLValue = await getGerritURL();

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

			const api = new GerritAPI(url, username, password, null, null);
			if (!(await api.testConnection())) {
				return {
					isValid: false,
					message: 'Invalid URL or credentials',
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
		...optionalArrayEntry(url !== initialURLValue, () =>
			config.update('gerrit.auth.url', url, ConfigurationTarget.Global)
		),
		config.update(
			'gerrit.auth.username',
			username,
			ConfigurationTarget.Global
		),
		config.update(
			'gerrit.auth.password',
			password,
			ConfigurationTarget.Global
		),
	]);

	await window.showInformationMessage('Gerrit connection successful!');
}

async function enterCookieCredentials(): Promise<void> {
	const config = getConfiguration();
	const initialURLValue = await getGerritURL();

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

			const api = new GerritAPI(url, null, null, cookie, null);
			if (!(await api.testConnection())) {
				return {
					isValid: false,
					message: 'Invalid URL or cookie',
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
		...optionalArrayEntry(url !== initialURLValue, () =>
			config.update('gerrit.auth.url', url, ConfigurationTarget.Global)
		),
		config.update('gerrit.auth.cookie', cookie, ConfigurationTarget.Global),
	]);

	await window.showInformationMessage('Gerrit connection successful!');
}

export async function enterCredentials(): Promise<void> {
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
		await enterBasicCredentials();
	} else {
		await enterCookieCredentials();
	}
}
