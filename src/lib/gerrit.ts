import { isGerritCommit } from './commit';
import { getGitAPI } from './git';
import { log } from './log';

export async function isUsingGerrit(): Promise<boolean> {
	const gitAPI = getGitAPI();

	if (!gitAPI) {
		return false;
	}

	if (gitAPI.repositories.length === 0) {
		log('Did not find any git repositories, exiting');
		return false;
	}

	if (gitAPI.repositories.length > 1) {
		log('Using multiple repositores is not supported, exiting.');
		return false;
	}

	const repo = gitAPI.repositories[0];

	// Get the last commit and check if it's a gerrit one
	const lastCommit = (await repo.log({ maxEntries: 1 }))[0];

	if (!lastCommit) {
		log('No commits found, exiting.');
		return false;
	}

	if (!isGerritCommit(lastCommit)) {
		log('Last commit is not a gerrit commit, exiting.');
		return false;
	}

	return true;
}
