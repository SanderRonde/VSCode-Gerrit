import { Commit } from '../types/vscode-extension-git';
import { getLastCommit } from './git';

const gerritChangeIDRegex = /Change-Id: (([a-zA-Z0-9])?([a-z0-9]{40}))/;

export function getChangeID(commit: Commit): string | null {
	const msg = commit.message;
	return gerritChangeIDRegex.exec(msg)?.[1] ?? null;
}

export async function getCurrentChangeID(): Promise<string | null> {
	const lastCommit = await getLastCommit();
	if (!lastCommit || !isGerritCommit(lastCommit)) {
		return null;
	}

	return getChangeID(lastCommit);
}

export function isGerritCommit(commit: Commit): boolean {
	return !!getChangeID(commit);
}
