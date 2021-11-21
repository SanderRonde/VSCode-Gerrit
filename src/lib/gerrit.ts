import { GerritAPI, GerritAPIWith, GerritChange, getAPI } from './gerritAPI';
import { Commit } from '../types/vscode-extension-git';
import { getGitAPI, getLastCommit } from './git';
import { getChangeCache } from './gerritCache';
import { log } from './log';

const gerritChangeIdRegex = /Change-Id: (([a-zA-Z0-9])?([a-z0-9]{40}))/;
const changeCache: Map<number, GerritChange> = new Map();

export function getChangeId(commit: Commit) {
	const msg = commit.message;
	return gerritChangeIdRegex.exec(msg)?.[1];
}

export async function getCurrentChangeId() {
	const lastCommit = await getLastCommit();
	if (!lastCommit || !isGerritCommit(lastCommit)) {
		return null;
	}

	return getChangeId(lastCommit);
}

export function isGerritCommit(commit: Commit) {
	return !!getChangeId(commit);
}

export async function getChangeNumber(changeId: string) {
	return (await getChange(changeId))?._number;
}

export const getChange: GerritAPI['getChange'] = ((
	changeId: string,
	...withValues: GerritAPIWith[]
) => {
	const api = getAPI();
	if (!api) {
		return null;
	}

	return api.getChange(changeId, ...withValues);
}) as any;

export const getChangeCached: GerritAPI['getChange'] = ((
	changeId: string,
	...withValues: GerritAPIWith[]
) => {
	const cache = getChangeCache();
	if (cache.has(changeId, withValues)) {
		return cache.get(changeId, withValues)!;
	}

	return getChange(changeId, ...withValues);
}) as any;

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
