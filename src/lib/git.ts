import { Commit, GitExtension } from '../types/vscode-extension-git';
import { PERIODICAL_FETCH_INTERVAL } from './constants';
import { ExtensionContext, extensions } from 'vscode';
import { createAwaitingInterval } from './util';

export function getGitAPI() {
	const extension = extensions.getExtension<GitExtension>('vscode.git');
	if (!extension) {
		return null;
	}
	return extension?.exports.getAPI(1);
}

export async function getLastCommit() {
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
	handler: (lastCommit: Commit) => void,
	callInitial: boolean = false
) {
	const gitAPI = getGitAPI();
	if (!gitAPI) {
		return { dispose: () => {} };
	}

	let currentLastCommit = await getLastCommit();
	if (callInitial && currentLastCommit) {
		handler(currentLastCommit);
	}
	const interval = createAwaitingInterval(async () => {
		const newLastCommit = await getLastCommit();
		if (!newLastCommit) {
			return;
		}
		if (!currentLastCommit) {
			currentLastCommit = newLastCommit;
			handler(currentLastCommit);
			return;
		}
		if (
			newLastCommit.hash !== currentLastCommit.hash ||
			newLastCommit.message !== currentLastCommit.message
		) {
			currentLastCommit = newLastCommit;
			handler(currentLastCommit);
		}
	}, PERIODICAL_FETCH_INTERVAL);

	return interval;
}
