import {
	commands,
	ConfigurationTarget,
	ExtensionContext,
	window,
} from 'vscode';
import { MultiStepEntry, MultiStepper } from '../lib/multiStep';
import { showInvalidSettingsMessage } from '../lib/messages';
import { getConfiguration } from '../lib/config';
import { GerritAPI } from '../lib/gerritAPI/api';
import got from 'got';

export enum GerritExtensionCommands {
	ENTER_CREDENTIALS = 'gerrit.enterCredentials',
	CHECK_CONNECTION = 'gerrit.checkConnection',
}

async function enterCredentials() {
	const config = getConfiguration();
	const urlStep = new MultiStepEntry({
		placeHolder: 'http://gerrithost.com',
		prompt: 'Enter the URL of your Gerrit server',
		value: config.get('gerrit.url'),
		validate: async (url: string) => {
			try {
				await got(url);
				return { isValid: true };
			} catch (e) {
				return {
					isValid: false,
					message: `Failed to reach URL: "${e}""`,
				};
			}
		},
	});
	const usernameStep = new MultiStepEntry({
		placeHolder: 'myuser',
		prompt: 'Enter your Gerrit username',
		value: config.get('gerrit.username'),
	});
	const passwordStep = new MultiStepEntry({
		placeHolder: 'password',
		prompt: (stepper) =>
			`Enter your Gerrit password (see ${
				stepper.values[0] ?? 'www.yourgerrithost.com'
			}/settings/#HTTPCredentials)`,
		value: config.get('gerrit.password'),
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

			const api = new GerritAPI(url, username, password);
			if (await !api.testConnection()) {
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
	config.update('gerrit.url', url, ConfigurationTarget.Global);
	config.update('gerrit.username', username, ConfigurationTarget.Global);
	config.update('gerrit.password', password, ConfigurationTarget.Global);
}

async function checkConnection() {
	const config = getConfiguration();
	const url = config.get('gerrit.url');
	const username = config.get('gerrit.username');
	const password = config.get('gerrit.password');

	if (!url || !username || !password) {
		showInvalidSettingsMessage(
			'Missing URL, username or password. Please set them in your settings. (gerrit.{url|username|password})'
		);
		return;
	}

	const api = new GerritAPI(url, username, password);
	if (!(await api.testConnection())) {
		showInvalidSettingsMessage(
			'Connection to Gerrit failed, please check your settings and/or connection'
		);
		return;
	}

	window.showInformationMessage('Succesfully connected!');
}

export function registerCommands(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.ENTER_CREDENTIALS,
			enterCredentials
		)
	);
	context.subscriptions.push(
		commands.registerCommand(
			GerritExtensionCommands.CHECK_CONNECTION,
			checkConnection
		)
	);
}
