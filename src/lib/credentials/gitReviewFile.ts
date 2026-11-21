import { findRemoteName, GitExec, parseRemoteURL } from './inferRemote';
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
	gerritRepo: Repository,
	preferredRemote?: string
): Promise<GitReviewFile | null> {
	log('Inferring host and project from remote');
	const exec: GitExec = (cmd) =>
		tryExecAsync(cmd, {
			cwd: gerritRepo.rootUri.fsPath,
			silent: true,
		});

	const remote = await findRemoteName(exec, {
		preferredRemote,
		defaultRemote: DEFAULT_GIT_REVIEW_FILE.remote,
	});
	if (!remote) {
		log(
			'Failed to infer host and project: could not determine which git remote points to Gerrit. Add a .gitreview file to the repository to configure it explicitly.'
		);
		return null;
	}

	const { success, stdout } = await tryExecAsync(
		`git remote get-url ${remote}`,
		{
			cwd: gerritRepo.rootUri.fsPath,
		}
	);
	if (!success) {
		log(`Failed to get URL of remote "${remote}"`);
		return null;
	}

	const remoteURL = stdout.trim();
	const parsed = parseRemoteURL(remoteURL);
	if (!parsed) {
		log(`Failed to parse URL of remote "${remote}": ${remoteURL}`);
		return null;
	}

	log(
		`Inferred host "${parsed.host}" and project "${parsed.project}" from remote "${remote}"`
	);
	return {
		host: parsed.host,
		port: parsed.port || DEFAULT_GIT_REVIEW_FILE.port,
		project: parsed.project,
	};
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
	const hostAndProject = await inferHostAndProject(
		gerritRepo,
		parsed?.defaultremote ?? parsed?.remote
	);
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
