import { MultiStepEntry, MultiStepper } from './multiStep';
import { ConfigurationTarget } from 'vscode';
import { getConfiguration } from './config';
import { GerritAPI } from './gerritAPI/api';
import got from 'got/dist/source';

export async function enterCredentials(): Promise<void> {
	const config = getConfiguration();
	const urlStep = new MultiStepEntry({
		placeHolder: 'http://gerrithost.com',
		prompt: 'Enter the URL of your Gerrit server',
		value: config.get('gerrit.auth.url'),
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

			const api = new GerritAPI(url, username, password);
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
		config.update('gerrit.auth.url', url, ConfigurationTarget.Global),
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
}
