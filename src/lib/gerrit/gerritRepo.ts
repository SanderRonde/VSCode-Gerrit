import {
	API,
	GitExtension,
	Repository,
} from '../../types/vscode-extension-git';
import { Disposable, ExtensionContext, extensions, Uri, window } from 'vscode';
import { FileMeta, GERRIT_FILE_SCHEME } from '../../providers/fileProvider';
import { getGitReviewFile } from '../credentials/gitReviewFile';
import { isGerritCommit } from '../git/commit';
import { tryExecAsync } from '../git/gitCLI';
import { GerritAPI } from './gerritAPI/api';
import { getRemote } from '../git/git';
import { wait } from '../util/util';
import { Data } from '../util/data';
import { log } from '../util/log';

export class GerritRepo {
	public constructor(public readonly repository: Repository) {}

	public get rootUri(): Uri {
		return this.repository.rootUri;
	}

	public get rootPath(): string {
		return this.repository.rootUri.fsPath;
	}
}

export class GerritRemote {
	public constructor(
		public readonly host: HostUrl,
		public readonly remoteReposD: Data<GerritRepo[]>
	) {}

	public async getRepoForProject(
		project: string
	): Promise<GerritRepo | null> {
		const remoteRepos = this.remoteReposD.get();
		if (remoteRepos.length === 1) {
			return remoteRepos[0];
		}

		for (const remoteRepo of remoteRepos) {
			const gitReviewFile = await getGitReviewFile(remoteRepo);
			if (gitReviewFile?.project === project) {
				return remoteRepo;
			}
		}
		return null;
	}

	public async getRepoForChangeID(
		changeID: string,
		api: GerritAPI
	): Promise<GerritRepo | null> {
		const remoteRepos = this.remoteReposD.get();
		if (remoteRepos.length === 1) {
			return remoteRepos[0];
		}

		const change = await api.getChange(changeID, null).fetchOnce();
		if (!change) {
			return null;
		}
		for (const remoteRepo of remoteRepos) {
			const gitReviewFile = await getGitReviewFile(remoteRepo);
			if (gitReviewFile?.project === change.project) {
				return remoteRepo;
			}
		}
		return null;
	}

	public async getProjects(): Promise<string[]> {
		return (
			await Promise.all(
				this.remoteReposD
					.get()
					.map(
						async (repo) =>
							(await getGitReviewFile(repo, false))?.project
					)
			)
		).filter(Boolean) as string[];
	}
}

export type HostUrl = string & {
	__hostUrl: never;
};
export type RemoteUrl = string & {
	__remoteUrl: never;
};
export class GerritRemoteWithConfig extends GerritRemote {
	public constructor(
		public override readonly host: HostUrl,
		public override readonly remoteReposD: Data<GerritRepo[]>,
		public readonly config: {
			username?: string;
			password?: string;
			cookie?: string;
			extraCookies?: Record<string, string>;
			url: string;
		}
	) {
		super(host, remoteReposD);
	}
}

function applyTrailingSlashFix<U extends string>(url: U): U {
	if (url.endsWith('/')) {
		return url.substring(0, url.length - 1) as U;
	}
	return url;
}

export async function gerritReposToRemotes(
	gerritRepos: GerritRepo[]
): Promise<GerritRemote[]> {
	const remotesMap = new Map<HostUrl, GerritRepo[]>();
	for (const gerritRepo of gerritRepos) {
		const gitReviewFile = await getGitReviewFile(gerritRepo);
		let host = (gitReviewFile?.remote ?? gitReviewFile?.host) as HostUrl;
		if (!host) {
			const { stdout, success } = await tryExecAsync(
				`git config --get remote.${await getRemote(gerritRepo.rootPath, gitReviewFile)}.url`,
				gerritRepo.rootPath
			);
			host = (success ? stdout.trim() : gerritRepo.rootPath) as HostUrl;
		}
		remotesMap.set(host, [...(remotesMap.get(host) ?? []), gerritRepo]);
	}

	const remotes = [];
	for (const [host, gerritRepos] of remotesMap.entries()) {
		remotes.push(
			new GerritRemote(applyTrailingSlashFix(host), new Data(gerritRepos))
		);
	}

	return remotes;
}

async function tryGetGitAPI(): Promise<false | API> {
	for (let i = 0; i < 1000 * 60; await wait(1000), i += 1000) {
		try {
			const extension =
				extensions.getExtension<GitExtension>('vscode.git');
			if (!extension) {
				continue;
			}

			return extension.exports.getAPI(1);
		} catch (e) {
			log('Failed to get git API, retrying in 1 second');
			continue;
		}
	}

	log(
		'Failed to get git API after 60 seconds, it looks like VSCode has disconnected from the host'
	);

	return false;
}

async function getGerritReposFromGit(
	gitAPI: API,
	silent: boolean = true
): Promise<GerritRepo[]> {
	const gerritRepos = await Promise.all(
		gitAPI.repositories.map(async (repository) => {
			// Get the last X commits and check there's it's a gerrit one
			const lastCommit = await repository.log({ maxEntries: 50 });

			if (lastCommit.length === 0) {
				if (!silent) {
					log('No commits found, skipping repo.');
				}
				return null;
			}

			if (lastCommit.every((c) => !isGerritCommit(c))) {
				if (!silent) {
					log(
						'No gerrit commits found in last 50 commits, skipping repo.'
					);
				}
				return null;
			}

			return new GerritRepo(repository);
		})
	);

	return gerritRepos.filter((r) => r !== null) as GerritRepo[];
}

async function scanGerritRepos(gitAPI: API): Promise<GerritRepo[]> {
	if (gitAPI.repositories.length === 0) {
		log('Did not find any git repositories files, exiting');
		return [];
	}

	const gerritRepos = await getGerritReposFromGit(gitAPI, true);
	if (gerritRepos.length === 0) {
		log(
			`Found no gerrit repos in ${gitAPI.repositories.length} repositories, exiting`
		);
		return [];
	} else {
		return gerritRepos;
	}
}

export async function getGerritRepos(
	context: ExtensionContext
): Promise<Data<GerritRepo[]>> {
	const gitAPI = await tryGetGitAPI();
	if (!gitAPI) {
		return new Data<GerritRepo[]>([]);
	}

	const scannedRepos = await scanGerritRepos(gitAPI);
	const repos = new Data(scannedRepos);

	context.subscriptions.push(
		gitAPI.onDidOpenRepository(async () => {
			repos.set(await scanGerritRepos(gitAPI));
		})
	);
	context.subscriptions.push(
		gitAPI.onDidCloseRepository(async () => {
			repos.set(await scanGerritRepos(gitAPI));
		})
	);

	return repos;
}

export function getCurrentGerritRepo(
	gerritRepos: GerritRepo[],
	errorBehavior: 'warn' | 'silent'
): GerritRepo | null {
	return getCurrentGerritRepoForUri(
		gerritRepos,
		window.activeTextEditor?.document.uri ?? null,
		errorBehavior
	);
}

export function getCurrentGerritRepoForUri(
	gerritRepos: GerritRepo[],
	uri: Uri | null,
	errorBehavior: 'warn' | 'silent'
): GerritRepo | null {
	if (!uri) {
		if (errorBehavior === 'warn') {
			void window.showWarningMessage(
				'No active file, cannot determine gerrit repo'
			);
		}
		return null;
	}

	if (uri.scheme === GERRIT_FILE_SCHEME) {
		const meta = FileMeta.tryFrom(uri);
		if (meta) {
			for (const repo of gerritRepos) {
				if (meta.repoUri === repo.rootUri.toString()) {
					return repo;
				}
			}
		}
	}

	for (const repo of gerritRepos) {
		const root = repo.rootUri;
		if (uri?.toString().startsWith(root.path)) {
			return repo;
		}
	}

	if (errorBehavior === 'warn') {
		void window.showWarningMessage(
			'Failed to find gerrit repo for active file'
		);
	}

	return null;
}

export async function pickGerritRepo(
	gerritRepos: GerritRepo[]
): Promise<GerritRepo | null> {
	if (gerritRepos.length === 1) {
		return gerritRepos[0];
	}

	const choice = await window.showQuickPick(
		gerritRepos.map((repo) => ({
			label: repo.rootPath,
			repo,
		})),
		{
			title: 'Select a Gerrit repository',
			matchOnDescription: true,
		}
	);
	return choice?.repo ?? null;
}

export function onChangeCurrentRepo(
	gerritReposD: Data<GerritRepo[]>,
	callback: (newRepo: GerritRepo) => void | Promise<void>
): Disposable {
	let currentRepo: GerritRepo | null = null;
	return window.onDidChangeActiveTextEditor((editor) => {
		if (!editor) {
			return;
		}

		const repo = getCurrentGerritRepoForUri(
			gerritReposD.get(),
			editor.document.uri,
			'silent'
		);

		if (repo && repo !== currentRepo) {
			currentRepo = repo;
			void callback(repo);
		}
	});
}

export function getRepoFromUri(
	gerritRepos: GerritRepo[],
	uri: string
): GerritRepo | undefined {
	return gerritRepos.find((repo) => repo.rootUri.toString() === uri);
}

export function setListenerForRepos<S>(
	gerritReposD: Data<GerritRepo[]>,
	onAddListener: (repository: GerritRepo) => S | Promise<S>,
	onRemovedListener?: (
		repository: GerritRepo,
		state: S | undefined
	) => void | Promise<void>
): Disposable {
	const checkedRepos = new Set<GerritRepo>();
	const stateForRepos = new Map<GerritRepo, S>();
	return gerritReposD.subscribe(
		async (gerritRepos: GerritRepo[]): Promise<void> => {
			for (const gerritRepo of gerritRepos) {
				if (checkedRepos.has(gerritRepo)) {
					continue;
				}
				checkedRepos.add(gerritRepo);

				stateForRepos.set(gerritRepo, await onAddListener(gerritRepo));
			}

			for (const repo of checkedRepos) {
				if (!gerritRepos.includes(repo)) {
					checkedRepos.delete(repo);
					await onRemovedListener?.(repo, stateForRepos.get(repo));
				}
			}
		}
	);
}
