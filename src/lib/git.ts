import { API, Commit, GitExtension } from '../types/vscode-extension-git';
import { PERIODICAL_FETCH_INTERVAL } from './constants';
import { createAwaitingInterval } from './util';
import { Disposable, extensions } from 'vscode';

export function getGitAPI(): API | null {
	const extension = extensions.getExtension<GitExtension>('vscode.git');
	if (!extension) {
		return null;
	}
	return extension?.exports.getAPI(1);
}

export async function getLastCommit(): Promise<Commit | null> {
	const api = getGitAPI();

	if (!api || api.repositories.length !== 1) {
		return null;
	}

	return (
		(
			await api.repositories[0].log({
				maxEntries: 1,
			})
		)[0] ?? null
	);
}

export async function onChangeLastCommit(
	handler: (lastCommit: Commit) => void | Promise<void>,
	callInitial = false
): Promise<Disposable> {
	const gitAPI = getGitAPI();
	if (!gitAPI) {
		return { dispose: () => {} };
	}

	let currentLastCommit = await getLastCommit();
	if (callInitial && currentLastCommit) {
		await handler(currentLastCommit);
	}
	const interval = createAwaitingInterval(async () => {
		const newLastCommit = await getLastCommit();
		if (!newLastCommit) {
			return;
		}
		if (!currentLastCommit) {
			currentLastCommit = newLastCommit;
			await handler(currentLastCommit);
			return;
		}
		if (
			newLastCommit.hash !== currentLastCommit.hash ||
			newLastCommit.message !== currentLastCommit.message
		) {
			currentLastCommit = newLastCommit;
			await handler(currentLastCommit);
		}
	}, PERIODICAL_FETCH_INTERVAL);

	return interval;
}
