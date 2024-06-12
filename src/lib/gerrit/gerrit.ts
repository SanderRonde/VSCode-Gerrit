import {
	ConfigurationTarget,
	Disposable,
	ExtensionContext,
	extensions,
	QuickPickItem,
	Uri,
	window,
} from 'vscode';
import {
	API,
	GitExtension,
	Repository,
} from '../../types/vscode-extension-git';
import { getConfiguration } from '../vscode/config';
import { isGerritCommit } from '../git/commit';
import { wait } from '../util/util';
import { log } from '../util/log';

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

async function getGerritRepos(silent: boolean = true): Promise<Repository[]> {
	const gitAPI = await tryGetGitAPI();
	if (!gitAPI) {
		return [];
	}
	return await Promise.all(
		gitAPI.repositories.filter(async (repo) => {
			// Get the last X commits and check there's it's a gerrit one
			const lastCommit = await repo.log({ maxEntries: 50 });

			if (lastCommit.length === 0) {
				if (!silent) {
					log('No commits found, skipping repo.');
				}
				return false;
			}

			if (lastCommit.some((c) => !isGerritCommit(c))) {
				if (!silent) {
					log(
						'No gerrit commits found in last 50 commits, skipping repo.'
					);
				}
				return false;
			}

			return true;
		})
	);
}

export async function pickGitRepo(): Promise<Repository | null> {
	const gerritRepos = await getGerritRepos(false);
	const items: QuickPickItem[] = gerritRepos.map((repo) => {
		return {
			label: repo.rootUri.fsPath,
		};
	});
	const quickPickChoice = await window.showQuickPick(items, {
		title: 'Please pick a gerrit root to use with this extension (you can change this later with the "Gerrit: change git repo" command)',
	});

	if (!quickPickChoice) {
		return null;
	}

	await getConfiguration().update(
		'gerrit.gitRepo',
		quickPickChoice.label,
		ConfigurationTarget.Workspace
	);
	return gerritRepos.find(
		(repo) => repo.rootUri.fsPath === quickPickChoice.label
	)!;
}

async function scanGerritRepos(gitAPI: API): Promise<Repository | null> {
	if (gitAPI.repositories.length === 0) {
		log('Did not find any git repositories, exiting');
		return null;
	}

	const gerritRepos = await getGerritRepos(true);
	if (gerritRepos.length === 0) {
		log(
			`Found no gerrit repos in ${gitAPI.repositories.length} repositories, exiting`
		);
		return null;
	} else if (gerritRepos.length === 1) {
		return gerritRepos[0];
	} else {
		const config = getConfiguration().get('gerrit.gitRepo');
		const match = gerritRepos.find(
			(repo) => repo.rootUri.fsPath === config
		);
		if (match) {
			return match;
		}

		// Ask user to choose
		const CHOOSE_OPTION = 'Choose from dropdown';
		const CANCEL_OPTION = 'Cancel';
		const choice = await window.showInformationMessage(
			'Gerrit: found multiple gerrit roots, please choose which one you\'d like to use the extension with. (you can change this later with the "Gerrit: change git repo" command',
			CHOOSE_OPTION,
			CANCEL_OPTION
		);

		if (choice !== CHOOSE_OPTION) {
			await window.showInformationMessage('Gerrit: disabled for now');
			return null;
		}

		const pickedRepo = await pickGitRepo();
		if (!pickedRepo) {
			await window.showInformationMessage('Gerrit: disabled for now');
		}
		return pickedRepo;
	}
}

export async function getGerritRepo(
	context: ExtensionContext
): Promise<Repository | null> {
	const gitAPI = await tryGetGitAPI();
	if (!gitAPI) {
		return null;
	}

	// If a gerrit repo has been manually set, force-open that one
	const pickedRepo = getConfiguration().get('gerrit.gitRepo');
	if (
		pickedRepo &&
		!gitAPI.repositories.find((repo) => repo.rootUri.fsPath === pickedRepo)
	) {
		await gitAPI.openRepository(Uri.file(pickedRepo));
	}

	const scannedRepo = await scanGerritRepos(gitAPI);
	if (scannedRepo) {
		return scannedRepo;
	}
	return new Promise<Repository>((resolve) => {
		let listener: Disposable | null = gitAPI.onDidOpenRepository(
			async () => {
				const repo = await scanGerritRepos(gitAPI);
				if (repo) {
					resolve(repo);
					listener?.dispose();
					listener = null;
				}
			}
		);
		context.subscriptions.push({
			dispose: () => {
				listener?.dispose();
			},
		});
	});
}
