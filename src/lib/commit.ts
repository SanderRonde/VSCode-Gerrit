import { Commit } from '../types/vscode-extension-git';
import { getLastCommit } from './git';

const gerritChangeIdRegex = /Change-Id: (([a-zA-Z0-9])?([a-z0-9]{40}))/;

export function getChangeId(commit: Commit): string | null {
	const msg = commit.message;
	return gerritChangeIdRegex.exec(msg)?.[1] ?? null;
}

export async function getCurrentChangeId(): Promise<string | null> {
	const lastCommit = await getLastCommit();
	if (!lastCommit || !isGerritCommit(lastCommit)) {
		return null;
	}

	return getChangeId(lastCommit);
}

export function isGerritCommit(commit: Commit): boolean {
	return !!getChangeId(commit);
}
