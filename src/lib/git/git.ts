import { API, GitExtension } from '../../types/vscode-extension-git';
import { PERIODICAL_GIT_FETCH_INTERVAL } from '../util/constants';
import { getLastCommits, GitCommit, execAsync } from './gitCLI';
import { window, Disposable, extensions } from 'vscode';
import { createAwaitingInterval } from '../util/util';

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

export async function gitCheckoutRemote(patchNumber: number): Promise<void> {
	const api = getGitAPI();
	if (!api || !api.repositories.length) {
		return;
	}

	const uri = api.repositories[0].rootUri.fsPath;
	try {
		const stdout = await execAsync(`git-review -d ${String(patchNumber)}`, {
			cwd: uri,
		});
		await window.showInformationMessage(stdout);
	} catch {
		await window.showErrorMessage(
			'Checkout failed. Please commit your changes or stash them before you switch branches'
		);
	}
}
