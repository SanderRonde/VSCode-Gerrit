import { GerritRepo } from '../gerrit/gerritRepo';
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

function parseGitReviewFile(fileContent: string): GitReviewFile | null {
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
		const trimmed = value.trim();
		file[typedKey] = trimmed;

		if (typedKey === 'project' && trimmed.endsWith('.git')) {
			file[typedKey] = trimmed.slice(0, -'.git'.length);
		}
	}

	if (!file.host || !file.project) {
		log(
			'Found a `.gitreview` file but it did not contain a host and project which are required'
		);
		return null;
	}

	return file as GitReviewFile;
}

const gitReviewFilesForRepo = new Map<GerritRepo, GitReviewFile | null>();
export async function getGitReviewFile(
	gerritRepo: GerritRepo,
	cache: boolean = true
): Promise<GitReviewFile | null> {
	if (!cache || !gitReviewFilesForRepo.has(gerritRepo)) {
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
			gitReviewFilesForRepo.set(gerritRepo, null);
			return null;
		}

		const parsed = parseGitReviewFile(fileContent);
		gitReviewFilesForRepo.set(gerritRepo, parsed);
		if (!parsed) {
			return null;
		}
	}

	return gitReviewFilesForRepo.get(gerritRepo)!;
}
