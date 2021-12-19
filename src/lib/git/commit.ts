import { createWeakWrapperDisposer } from '../util/garbageCollection';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { Subscribable } from '../subscriptions/subscriptions';
import { getLastCommits, GitCommit } from './gitCLI';
import { createInittableValue } from '../util/cache';
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

const lastCurrentChangeID = createInittableValue<string | null>();

export async function setupChangeIDCache(): Promise<Disposable> {
	return await onChangeLastCommit((lastCommit) => {
		if (lastCommit && isGerritCommit(lastCommit)) {
			lastCurrentChangeID.setValue(getChangeID(lastCommit));
		} else {
			lastCurrentChangeID.setValue(null);
		}
	}, true);
}

export function getCurrentChangeIDCached(): Promise<string | null> {
	return lastCurrentChangeID.get();
}

export function isGerritCommit(commit: GitCommit): boolean {
	return !!getChangeID(commit);
}

export async function onChangeLastCommitOrChange(
	handler: (
		change: GerritChange | null,
		lastCommit: GitCommit
	) => Promise<void> | void,
	disposables: Disposable[],
	callInitial?: boolean
): Promise<void> {
	let currentSubscription: {
		value: Subscribable<GerritChange | null> | null;
	} = { value: null };

	disposables.push(
		createWeakWrapperDisposer(new WeakRef(currentSubscription))
	);
	disposables.push(
		await onChangeLastCommit(async (lastCommit) => {
			if (currentSubscription.value) {
				currentSubscription.value.unsubscribe();
			}
			currentSubscription = {
				value:
					isGerritCommit(lastCommit) && getChangeID(lastCommit)
						? await GerritChange.getChange(getChangeID(lastCommit)!)
						: null,
			};

			const change =
				(await currentSubscription.value?.getValue()) ?? null;
			currentSubscription.value?.subscribe(
				new WeakRef(async (change) => {
					await handler(change, lastCommit);
				})
			);
			await handler(change, lastCommit);
		}, callInitial)
	);
}
