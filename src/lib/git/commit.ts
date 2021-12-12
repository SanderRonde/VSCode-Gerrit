import { getLastCommits, GitCommit } from './gitCLI';
import { onChangeLastCommit } from './git';
import { Disposable } from 'vscode';

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

let lastCurrentChangeID: string | null = null;
let resolveChangeIDCacheReady: (() => void) | null = null;
let changeIDCacheReadyPromise: Promise<void> = new Promise((resolve) => {
	resolveChangeIDCacheReady = resolve;
});
export async function setupChangeIDCache(): Promise<Disposable> {
	return await onChangeLastCommit((lastCommit) => {
		if (lastCommit && isGerritCommit(lastCommit)) {
			lastCurrentChangeID = getChangeID(lastCommit);
		} else {
			lastCurrentChangeID = null;
		}
		if (!resolveChangeIDCacheReady) {
			changeIDCacheReadyPromise = Promise.resolve();
		} else {
			resolveChangeIDCacheReady?.();
		}
	}, true);
}

export async function getCurrentChangeIDCached(): Promise<string | null> {
	await changeIDCacheReadyPromise;
	return lastCurrentChangeID;
}

export function isGerritCommit(commit: GitCommit): boolean {
	return !!getChangeID(commit);
}
