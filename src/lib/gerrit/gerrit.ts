import {
	API,
	GitExtension,
	Repository,
} from '../../types/vscode-extension-git';
import { ConfigurationTarget, extensions, QuickPickItem, window } from 'vscode';
import { getConfiguration } from '../vscode/config';
import { isGerritCommit } from '../git/commit';
import { log } from '../util/log';

let gerritRepo: Repository | null = null;
export function getGitRepo(): Repository | null {
	return gerritRepo;
}

function getGitAPI(): false | API {
	const extension = extensions.getExtension<GitExtension>('vscode.git');
	if (!extension) {
		return false;
	}
	return extension?.exports.getAPI(1);
}

async function getGerritRepos(silent: boolean = true): Promise<Repository[]> {
	const gitAPI = getGitAPI();
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

export async function pickGitRepo(): Promise<boolean> {
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
		return false;
	}

	await getConfiguration().update(
		'gerrit.gitRepo',
		quickPickChoice.label,
		ConfigurationTarget.Workspace
	);
	gerritRepo = gerritRepos.find(
		(repo) => repo.rootUri.fsPath === quickPickChoice.label
	)!;
	return true;
}

export async function isUsingGerrit(silent: boolean = false): Promise<boolean> {
	const gitAPI = getGitAPI();
	if (!gitAPI) {
		return false;
	}

	if (gitAPI.repositories.length === 0) {
		if (!silent) {
			log('Did not find any git repositories, exiting');
		}
		return false;
	}

	const gerritRepos = await getGerritRepos(true);
	if (gerritRepos.length === 0) {
		if (!silent) {
			log(
				`Found no gerrit repos in ${gitAPI.repositories.length} repositories, exiting`
			);
		}
		return false;
	} else if (gerritRepos.length === 1) {
		gerritRepo = gerritRepos[0];
		return true;
	} else {
		const config = getConfiguration().get('gerrit.gitRepo');
		const match = gerritRepos.find(
			(repo) => repo.rootUri.fsPath === config
		);
		if (match) {
			gerritRepo = match;
			return true;
		}

		if (silent) {
			return false;
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
			return false;
		}

		const success = await pickGitRepo();
		if (!success) {
			await window.showInformationMessage('Gerrit: disabled for now');
		}
		return success;
	}
}
