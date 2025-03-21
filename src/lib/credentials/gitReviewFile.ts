import { Repository } from '../../types/vscode-extension-git';
import { createCacheWrapper } from '../util/cache';
import { tryExecAsync } from '../git/gitCLI';
import { Uri, workspace } from 'vscode';
import { log } from '../util/log';

interface OptionalGitReviewProperties {
	port?: string;
	branch?: string;
	remote?: string;
	defaultbranch?: string;
	defaultremote?: string;
}

export interface GitReviewFile extends OptionalGitReviewProperties {
	host: string;
	project: string;
}

export const DEFAULT_GIT_REVIEW_FILE: Required<OptionalGitReviewProperties> = {
	branch: 'master',
	defaultbranch: 'master',
	defaultremote: 'origin',
	remote: 'origin',
	port: '29418',
};

async function inferHostAndProject(
	gerritRepo: Repository
): Promise<GitReviewFile | null> {
	log('Inferring host and project from remote');
	const { success, stdout } = await tryExecAsync(
		'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
		{
			cwd: gerritRepo.rootUri.fsPath,
		}
	);
	if (!success) {
		log('Failed to get remote');
		return null;
	}

	const remote = stdout.trim().split('/')[0];
	const { success: success2, stdout: stdout2 } = await tryExecAsync(
		`git remote get-url ${remote}`,
		{
			cwd: gerritRepo.rootUri.fsPath,
		}
	);
	if (!success2) {
		log('Failed to get remote URL');
		return null;
	}

	const remoteUrl = stdout2.trim();
	const urlRegex =
		/(?:ssh|http|https):\/\/(?:[^@]+@)?([^:/]+)(?::(\d+))?\/(.+?)(?:\.git)?$/;
	const match = urlRegex.exec(remoteUrl);
	if (match) {
		const [, host, port, project] = match;
		return {
			host,
			port: port || DEFAULT_GIT_REVIEW_FILE.port,
			project,
		};
	} else {
		log('Failed to parse remote URL');
		return null;
	}
}

function parseGerritFile(fileContent: string): GitReviewFile | null {
	if (!fileContent.includes('[gerrit]')) {
		// This header should be in there
		return null;
	}

	const file: Partial<GitReviewFile> = {};
	for (const line of fileContent.split('\n')) {
		if (!line.includes('=')) {
			continue;
		}

		const [key, value] = line.split('=');
		const typedKey = key as keyof GitReviewFile;
		file[typedKey] = value.trim();
	}

	return file as GitReviewFile;
}

export async function getGitReviewFile(
	gerritRepo: Repository
): Promise<GitReviewFile | null> {
	const fileContent = await (async (): Promise<string | null> => {
		try {
			return Buffer.from(
				await workspace.fs.readFile(
					Uri.joinPath(gerritRepo.rootUri, '.gitreview')
				)
			).toString('utf8');
		} catch (e) {
			return null;
		}
	})();
	if (!fileContent) {
		return await inferHostAndProject(gerritRepo);
	}

	const parsed = parseGerritFile(fileContent);
	const hostAndProject = await inferHostAndProject(gerritRepo);
	if (hostAndProject) {
		return {
			...hostAndProject,
			...parsed,
		};
	}

	if (!parsed?.host || !parsed?.project) {
		return null;
	}

	return parsed;
}

export const getGitReviewFileCached = createCacheWrapper(getGitReviewFile);
