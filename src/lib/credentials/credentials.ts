import {
	GerritRemote,
	GerritRemoteWithConfig,
	GerritRepo,
	gerritReposToRemotes,
	HostUrl,
} from '../gerrit/gerritRepo';
import {
	ConfigSettings,
	getConfiguration,
	getConfigurationWithLegacy,
} from '../vscode/config';
import { ConfigurationTarget, QuickPickItem, window } from 'vscode';
import { MultiStepEntry, MultiStepper } from '../vscode/multiStep';
import { GerritAPI } from '../gerrit/gerritAPI/api';
import { derefProxy } from '../util/util';
import { logDev } from '../util/log';
import { Data } from '../util/data';

export async function getRemotesWithConfig(
	gerritRepos: GerritRepo[]
): Promise<Record<HostUrl, GerritRemoteWithConfig>> {
	const configWithLegacy = getConfigurationWithLegacy();
	let remotesConfig = configWithLegacy.get('gerrit.remotes') ?? {};

	const remotes = await gerritReposToRemotes(gerritRepos);
	if (Object.keys(remotesConfig).length === 0) {
		for (const remote of remotes) {
			const username = configWithLegacy.get('gerrit.auth.username');
			const password = configWithLegacy.get('gerrit.auth.password');
			const cookie = configWithLegacy.get('gerrit.auth.cookie');
			const extraCookies = configWithLegacy.get('gerrit.extraCookies');

			const existingConfig = remotesConfig?.[remote.host];
			remotesConfig = {
				...remotesConfig,
				[remote.host]: {
					username: username ?? existingConfig?.username,
					password: password ?? existingConfig?.password,
					cookie: cookie ?? existingConfig?.cookie,
					extraCookies: extraCookies ?? existingConfig?.extraCookies,
				},
			};
		}
	}
	const remoteUrlMap = configWithLegacy.get('gerrit.urls') ?? {};
	for (const remote of remotes) {
		if (remoteUrlMap[remote.host]) {
			remotesConfig = {
				...remotesConfig,
				[remote.host]: {
					...remotesConfig[remote.host],
					url: remoteUrlMap[remote.host],
				},
			};
		}
	}

	const finalRemotes: Record<string, GerritRemoteWithConfig> = {};
	for (const remote of remotes) {
		const remoteConfig = {
			...remotesConfig['default'],
			...remotesConfig[remote.host],
		};
		finalRemotes[remote.host] = new GerritRemoteWithConfig(
			remote.host,
			remote.remoteReposD,
			{
				...remoteConfig,
				url: remoteConfig.url ?? remote.host,
			}
		);
	}
	logDev('Remotes:', finalRemotes);
	return finalRemotes;
}

async function enterBasicCredentials(
	gerritReposD: Data<GerritRepo[]>,
	remote: GerritRemote
): Promise<void> {
	const config = getConfiguration();
	const remotes = await getRemotesWithConfig(gerritReposD.get());
	const configForRemote = remotes[remote.host] as
		| GerritRemoteWithConfig
		| undefined;

	const initialUrl = configForRemote?.config.url ?? remote.host;
	const urlStep = new MultiStepEntry({
		placeHolder: 'myuser',
		prompt: 'Enter your gerrit web host. (e.g. <your-gerrit-host>/dashboard/self)',
		value: initialUrl,
	});
	const usernameStep = new MultiStepEntry({
		placeHolder: 'myuser',
		prompt: 'Enter your Gerrit username',
		value: configForRemote?.config.username,
	});
	const passwordStep = new MultiStepEntry({
		placeHolder: 'password',
		prompt: (stepper) =>
			`Enter your Gerrit password (see ${
				stepper.values[0] ?? 'www.yourgerrithost.com'
			}/settings/#HTTPCredentials)`,
		value: configForRemote?.config.password,
		isPassword: true,
		validate: async (password, stepper) => {
			const [url, username] = stepper.values;
			if (!url) {
				return {
					isValid: false,
					message: 'Missing url',
				};
			}

			if (!username) {
				return {
					isValid: false,
					message: 'Missing username',
				};
			}

			const api = new GerritAPI(
				gerritReposD,
				remote,
				GerritAPI.applySchemeFix(url),
				username,
				password,
				null,
				configForRemote?.config?.extraCookies ?? null,
				await remote.getProjects()
			);
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
	const updates: ConfigSettings['gerrit.remotes'][string] = {};
	if (username) {
		updates.username = username;
	}
	if (password) {
		updates.password = password;
	}
	if (url !== initialUrl) {
		updates.url = url;
	}
	if (Object.keys(updates).length > 0) {
		await config.update(
			'gerrit.remotes',
			derefProxy({
				...config.get('gerrit.remotes'),
				[remote.host]: {
					...(config.get('gerrit.remotes')?.[remote.host] ?? {}),
					...updates,
				},
			}),
			ConfigurationTarget.Global
		);
	}

	await window.showInformationMessage('Gerrit connection successful!');
}

async function enterCookieCredentials(
	gerritReposD: Data<GerritRepo[]>,
	remote: GerritRemote
): Promise<void> {
	const config = getConfiguration();
	const remotes = await getRemotesWithConfig(gerritReposD.get());
	const configForRemote = remotes[remote.host] as
		| GerritRemoteWithConfig
		| undefined;
	const initialUrl = configForRemote?.config.url ?? remote.host;

	const urlStep = new MultiStepEntry({
		placeHolder: 'myuser',
		prompt: 'Enter your gerrit web host. (e.g. <your-gerrit-host>/dashboard/self)',
		value: initialUrl,
	});
	const cookieStep = new MultiStepEntry({
		placeHolder: '34-char-long alphanumeric string',
		prompt: (stepper) =>
			`Enter your Gerrit authentication cookie (go to ${
				stepper.values[0] ?? 'www.yourgerrithost.com'
			} and copy the value of the GerritAccount cookie)`,
		value: configForRemote?.config.cookie,
		validate: async (cookie, stepper) => {
			const [url] = stepper.values;
			if (!url) {
				return {
					isValid: false,
					message: 'Missing URL',
				};
			}

			const api = new GerritAPI(
				gerritReposD,
				remote,
				GerritAPI.applySchemeFix(url),
				null,
				null,
				cookie,
				configForRemote?.config.extraCookies ?? null,
				await remote.getProjects()
			);
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
	const updates: ConfigSettings['gerrit.remotes'][string] = {};
	if (cookie) {
		updates.cookie = cookie;
	}
	if (url !== initialUrl) {
		updates.url = url;
	}
	if (Object.keys(updates).length > 0) {
		await config.update(
			'gerrit.remotes',
			derefProxy({
				...config.get('gerrit.remotes'),
				[remote.host]: {
					...(config.get('gerrit.remotes')?.[remote.host] ?? {}),
					...updates,
				},
			}),
			ConfigurationTarget.Global
		);
	}

	await window.showInformationMessage('Gerrit connection successful!');
}

export async function enterCredentials(
	gerritReposD: Data<GerritRepo[]>
): Promise<void> {
	const gerritRepos = gerritReposD.get();
	const remotesWithConfig = await getRemotesWithConfig(gerritRepos);
	const remote = await (async () => {
		if (Object.keys(remotesWithConfig).length > 1) {
			const labels = await Promise.all(
				Object.values(remotesWithConfig).map(
					async (
						remote
					): Promise<
						QuickPickItem & { remote: GerritRemoteWithConfig }
					> => {
						let label: string = remote.host;
						if (
							!(
								(!remote.config.username ||
									!remote.config.password) &&
								!remote.config.cookie
							)
						) {
							const api = new GerritAPI(
								gerritReposD,
								remote,
								GerritAPI.applySchemeFix(remote.config.url),
								remote.config.username ?? null,
								remote.config.password ?? null,
								remote.config.cookie ?? null,
								remote.config.extraCookies ?? null,
								await remote.getProjects()
							);
							if (await api.testConnection()) {
								label = label + ' (authenticated)';
							}
						}

						return {
							label,
							remote,
						};
					}
				)
			);

			const choice = await window.showQuickPick(labels, {
				ignoreFocusOut: true,
				placeHolder: 'Select the repository to authenticate',
				title: 'Gerrit Authentication',
			});
			return choice?.remote;
		}
		return Object.values(remotesWithConfig)[0];
	})();

	if (!remote) {
		return;
	}

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
		await enterBasicCredentials(gerritReposD, remote);
	} else {
		await enterCookieCredentials(gerritReposD, remote);
	}
}
