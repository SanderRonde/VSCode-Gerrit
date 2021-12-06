import { API, GitExtension } from '../../types/vscode-extension-git';
import { PERIODICAL_GIT_FETCH_INTERVAL } from '../util/constants';
import { createAwaitingInterval } from '../util/util';
import { getLastCommits, GitCommit } from './gitCLI';
import { Uri, window, Disposable, extensions } from 'vscode';
import { getLocalRepoUri } from '../credentials/credentials';

export function getGitAPI(): API | null {
	const extension = extensions.getExtension<GitExtension>('vscode.git');
	if (!extension) {
		return null;
	}
	return extension?.exports.getAPI(1);
}

export async function onChangeLastCommit(
	handler: (lastCommit: GitCommit) => void | Promise<void>,
	callInitial = false
): Promise<Disposable> {
	const gitAPI = getGitAPI();
	if (!gitAPI) {
		return { dispose: () => {} };
	}

	let currentLastCommit = (await getLastCommits(1))[0];
	if (callInitial && currentLastCommit) {
		await handler(currentLastCommit);
	}
	const interval = createAwaitingInterval(async () => {
		const newLastCommit = (await getLastCommits(1))[0];
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
	}, PERIODICAL_GIT_FETCH_INTERVAL);

	return interval;
}

export async function gitCheckout(branch: string): Promise<void> {
	const gitAPI = getGitAPI();
	const localRepoUri = await getLocalRepoUri();
	if (!gitAPI) {
		return;
	}

	if (!localRepoUri) {
		window.showErrorMessage(`setting gerrit.localGitRepoUri not found`);
		return;
	}

	const repo = gitAPI.getRepository(Uri.parse(localRepoUri));
	if (!repo) {
		return;
	}

	try {
		await repo.checkout(branch);
	} catch {
		window.showErrorMessage(`Local branch ${branch} not found.`);
	}
}
