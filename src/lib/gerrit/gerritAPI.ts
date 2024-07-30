import { GerritRemote, GerritRemoteWithConfig, GerritRepo } from './gerritRepo';
import { getRemotesWithConfig } from '../credentials/credentials';
import { showInvalidSettingsMessage } from '../vscode/messages';
import { setContextProp } from '../vscode/context';
import { GerritAPI } from './gerritAPI/api';
import { Data } from '../util/data';
import { log } from '../util/log';

const apis: Map<
	GerritRepo | GerritRemote,
	{
		noFailAPI: GerritAPI | null;
		failAllowedAPI: GerritAPI | null;
	}
> = new Map();

interface LastConfig {
	username: string | undefined;
	password: string | undefined;
}

const lastConfigs: Map<GerritRemote, LastConfig> = new Map();

function hasSameConfig(lastConfig: LastConfig, newConfig: LastConfig): boolean {
	return (
		newConfig.username === lastConfig.username &&
		newConfig.password === lastConfig.password
	);
}

export async function checkConnection(
	gerritReposD: Data<GerritRepo[]>
): Promise<boolean> {
	const gerritRepos = gerritReposD.get();
	const remotes = await getRemotesWithConfig(gerritRepos);

	for (const remote of Object.values(remotes)) {
		if (
			(!remote.config.username || !remote.config.password) &&
			!remote.config.cookie
		) {
			await showInvalidSettingsMessage(
				gerritReposD,
				'Missing URL, username or password. Please configure them using the "Enter credentials" command'
			);
			return false;
		}

		const api = new GerritAPI(
			gerritReposD,
			remote,
			remote.url,
			remote.config.username ?? null,
			remote.config.password ?? null,
			remote.config.cookie ?? null,
			remote.config.extraCookies ?? null,
			await remote.getProjects()
		);
		if (!(await api.testConnection())) {
			if (gerritRepos.length > 1) {
				await showInvalidSettingsMessage(
					gerritReposD,
					`Connection to Gerrit repository ${remote.url} failed, please check your settings and/or connection`
				);
			} else {
				await showInvalidSettingsMessage(
					gerritReposD,
					'Connection to Gerrit failed, please check your settings and/or connection'
				);
			}
			return false;
		}
	}

	return true;
}

async function createAPI(
	gerritReposD: Data<GerritRepo[]>,
	remote: GerritRemote,
	allowFail: boolean = false
): Promise<GerritAPI | null> {
	const remotesWithConfigs = await getRemotesWithConfig(gerritReposD.get());

	const remoteWithConfig = remotesWithConfigs[remote.url] as
		| GerritRemoteWithConfig
		| undefined;
	const lastConfig = lastConfigs.get(remote);
	if (
		(!remoteWithConfig?.config?.username ||
			!remoteWithConfig?.config?.password) &&
		!remoteWithConfig?.config?.cookie
	) {
		await setContextProp('gerrit:connected', false);
		if (
			!lastConfig ||
			!hasSameConfig(lastConfig, {
				username: remoteWithConfig?.config?.username,
				password: remoteWithConfig?.config?.password,
			})
		) {
			log(
				'Missing URL, username or password. Please set them in your settings. (gerrit.auth.{url|username|password})'
			);
			await showInvalidSettingsMessage(
				gerritReposD,
				'Missing Gerrit API connection settings. Please enter them using the "Gerrit credentials" command or in your settings file'
			);
		}
		lastConfigs.set(remote, {
			username: remoteWithConfig?.config?.username,
			password: remoteWithConfig?.config?.password,
		});
		return null;
	}

	const api = new GerritAPI(
		gerritReposD,
		remoteWithConfig,
		remoteWithConfig.url,
		remoteWithConfig.config?.username ?? null,
		remoteWithConfig.config?.password ?? null,
		remoteWithConfig.config?.cookie ?? null,
		remoteWithConfig.config?.extraCookies ?? null,
		await remoteWithConfig.getProjects(),
		allowFail
	);
	await setContextProp('gerrit:connected', true);
	return api;
}

export async function getAPIForRepo(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	allowFail: boolean = false
): Promise<GerritAPI | null> {
	const apisForRepo = apis.get(gerritRepo) ?? {
		failAllowedAPI: null,
		noFailAPI: null,
		gitReviewFile: null,
	};

	if (allowFail && apisForRepo?.failAllowedAPI) {
		return apisForRepo.failAllowedAPI;
	}
	if (!allowFail && apisForRepo?.noFailAPI) {
		return apisForRepo.noFailAPI;
	}

	const remotes = await getRemotesWithConfig(gerritReposD.get());
	const remote = Object.values(remotes).find((remote) =>
		remote.remoteReposD.get().includes(gerritRepo)
	)!;
	const newAPI = await createAPI(gerritReposD, remote, allowFail);
	if (allowFail) {
		apis.set(gerritRepo, {
			...apisForRepo,
			failAllowedAPI: newAPI,
		});
	} else {
		apis.set(gerritRepo, {
			...apisForRepo,
			noFailAPI: newAPI,
		});
	}

	return newAPI;
}

export async function getAPIForRemote(
	gerritReposD: Data<GerritRepo[]>,
	remote: GerritRemoteWithConfig,
	allowFail: boolean = false
): Promise<GerritAPI | null> {
	const apisForRepo = apis.get(remote) ?? {
		failAllowedAPI: null,
		noFailAPI: null,
		gitReviewFile: null,
	};

	if (allowFail && apisForRepo?.failAllowedAPI) {
		return apisForRepo.failAllowedAPI;
	}
	if (!allowFail && apisForRepo?.noFailAPI) {
		return apisForRepo.noFailAPI;
	}

	const newAPI = await createAPI(gerritReposD, remote, allowFail);
	if (allowFail) {
		apis.set(remote, {
			...apisForRepo,
			failAllowedAPI: newAPI,
		});
	} else {
		apis.set(remote, {
			...apisForRepo,
			noFailAPI: newAPI,
		});
	}

	return newAPI;
}

export async function getAPIForSubscription(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	allowFail: boolean = false
): Promise<GerritAPI> {
	const apiForRepo = await getAPIForRepo(gerritReposD, gerritRepo, allowFail);
	if (apiForRepo) {
		return apiForRepo;
	}

	const remotes = await getRemotesWithConfig(gerritReposD.get());
	const remote = Object.values(remotes).find((remote) =>
		remote.remoteReposD.get().includes(gerritRepo)
	)!;

	return new GerritAPI(
		gerritReposD,
		remote,
		remote.url,
		remote.config.username ?? null,
		remote.config.password ?? null,
		remote.config.cookie ?? null,
		remote.config.extraCookies ?? null,
		await remote.getProjects(),
		allowFail
	);
}
