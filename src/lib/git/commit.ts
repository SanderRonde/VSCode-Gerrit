import { getLastCommits, GitCommit } from './gitCLI';

const gerritChangeIDRegex = /Change-Id: (([a-zA-Z0-9])?([a-z0-9]{40}))/;

export function getChangeID(commit: GitCommit): string | null {
	const msg = commit.message;
	return gerritChangeIDRegex.exec(msg)?.[1] ?? null;
}

export async function getCurrentChangeID(): Promise<string | null> {
	const lastCommit = (await getLastCommits(1))[0];
	if (!lastCommit || !isGerritCommit(lastCommit)) {
		return null;
	}

	return getChangeID(lastCommit);
}

export function isGerritCommit(commit: GitCommit): boolean {
	return !!getChangeID(commit);
}
