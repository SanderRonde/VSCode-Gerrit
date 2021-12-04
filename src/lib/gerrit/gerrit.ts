import { isGerritCommit } from '../git/commit';
import { getGitAPI } from '../git/git';
import { log } from '../util/log';

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

	// Get the last 2 commits and check there's it's a gerrit one
	const lastCommit = await repo.log({ maxEntries: 2 });

	if (lastCommit.length === 0) {
		log('No commits found, exiting.');
		return false;
	}

	if (lastCommit.some((c) => !isGerritCommit(c))) {
		log('No gerrit commits found in last 2 commits, exiting.');
		return false;
	}

	return true;
}
