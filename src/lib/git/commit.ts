import {
	GerritRepo,
	getCurrentGerritRepo,
	setListenerForRepos,
} from '../gerrit/gerritRepo';
import { ChangeIDWithRepo } from '../gerrit/gerritAPI/gerritChange';
import { createInittableValue } from '../util/cache';
import { getLastCommits, GitCommit } from './gitCLI';
import { onChangeLastCommitForRepo } from './git';
import { Data } from '../util/data';
import { Disposable } from 'vscode';

const commitChangeIDRegex = /Change-Id: (([a-zA-Z0-9])?([a-z0-9]{40}))/;

export function getChangeID(commit: GitCommit): string | null {
	const msg = commit.message;
	return commitChangeIDRegex.exec(msg)?.[1] ?? null;
}

const changeIDRegex = /(([a-zA-Z0-9])?([a-z0-9]{40}))/;
export function isChangeID(msg: string): boolean {
	return changeIDRegex.test(msg);
}

export async function getCurrentChange(
	gerritRepos: GerritRepo[],
	errorBehavior: 'warn' | 'silent'
): Promise<ChangeIDWithRepo | null> {
	const currentRepo = getCurrentGerritRepo(gerritRepos, errorBehavior);
	if (!currentRepo) {
		return null;
	}

	return getCurrentChangeForRepo(currentRepo);
}

export async function getCurrentChangeForRepo(
	gerritRepo: GerritRepo
): Promise<ChangeIDWithRepo | null> {
	const lastCommit = (await getLastCommits(gerritRepo, 1))[0];
	if (!lastCommit || !isGerritCommit(lastCommit)) {
		return null;
	}

	const changeID = getChangeID(lastCommit);
	if (!changeID) {
		return null;
	}
	return {
		gerritRepo,
		changeID,
	};
}

const lastCurrentChangeID = createInittableValue<ChangeIDWithRepo | null>();

export function setupChangeIDCache(
	gerritReposD: Data<GerritRepo[]>
): Disposable {
	const disposables = new Set<Disposable>();
	setListenerForRepos(
		gerritReposD,
		async (gerritRepo) => {
			const disposable = await onChangeLastCommitForRepo(
				gerritRepo,
				(lastCommit) => {
					if (lastCommit && isGerritCommit(lastCommit)) {
						const changeID = getChangeID(lastCommit);
						if (changeID) {
							lastCurrentChangeID.setValue({
								changeID,
								gerritRepo,
							});
							return;
						}
					}
					lastCurrentChangeID.setValue(null);
				},
				true
			);
			disposables.add(disposable);
			return disposable;
		},
		(_, disposable) => {
			if (disposable) {
				void disposable.dispose();
				disposables.delete(disposable);
			}
		}
	);
	return {
		dispose: () => {
			disposables.forEach((disposable) => void disposable.dispose());
		},
	};
}

export function getCurrentChangeIDCached(): Promise<ChangeIDWithRepo | null> {
	return lastCurrentChangeID.get();
}

export function isGerritCommit(commit: GitCommit): boolean {
	return !!getChangeID(commit);
}
