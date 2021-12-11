import { API, GitExtension } from '../../types/vscode-extension-git';
import { PERIODICAL_GIT_FETCH_INTERVAL } from '../util/constants';
import { getLastCommits, GitCommit, execAsync } from './gitCLI';
import { window, Disposable, extensions } from 'vscode';
import { createAwaitingInterval } from '../util/util';
import { log } from '../util/log';

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
		void window.showErrorMessage('Multi-git-repo setups are not supported');
		return;
	}

	const uri = api.repositories[0].rootUri.fsPath;
	try {
		const stdout = await execAsync(`git-review -d ${String(patchNumber)}`, {
			cwd: uri,
			timeout: 10000,
		});
		void window.showInformationMessage(stdout);
	} catch (e: unknown) {
		const typedErr = e as { err: Error; stdout: string; stderr: string };
		log(`Tried to run git-review -d ${String(patchNumber)}, but failed`);
		log(`Stdout: ${typedErr.stdout}`);
		log(`Stderr: ${typedErr.stderr}`);
		void window.showErrorMessage(
			'Checkout failed. Please see log for more details'
		);
	}
}
