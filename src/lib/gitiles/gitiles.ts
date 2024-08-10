import {
	getGitReviewFile,
} from '../credentials/gitReviewFile';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { getCurrentBranch, getMainBranch } from '../git/git';
import { GitCommit, getLastCommits } from '../git/gitCLI';
import { GerritRepo } from '../gerrit/gerritRepo';
import { Uri, env, window } from 'vscode';
import { Data } from '../util/data';
import * as path from 'path';

export async function openOnGitiles(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	permalink: boolean,
	uri: Uri,
	line?: number
): Promise<void> {
	const gitReviewFile = await getGitReviewFile(gerritRepo);
	if (!gitReviewFile) {
		void window.showErrorMessage(
			'Failed to find .gitreview file, which is used to determine URL'
		);
		return;
	}

	const mainBranch = await getMainBranch(gerritRepo, gitReviewFile);
	const branch = await getCurrentBranch(gerritRepo);

	const project = gitReviewFile.project;
	const basePath = `https://${gitReviewFile.host}/plugins/gitiles/${project}/+`;
	const relativeFilePath = path.relative(gerritRepo.rootPath, uri.fsPath);

	// Find the revision with the same hash as the current commit
	const commit = (await getLastCommits(gerritRepo, 1))[0];
	if (!commit) {
		void window.showErrorMessage('Failed to find current commit hash');
		return;
	}

	const lineNumber = line ? `#${line}` : '';
	if (!permalink) {
		if (!branch?.includes('/')) {
			// If we're on some one-word branch, link to that branch itself
			await env.openExternal(
				Uri.parse(
					`${basePath}/${mainBranch}/${relativeFilePath}${lineNumber}`,
					true
				)
			);
			return;
		}

		const currentChange = await getCurrentChange(
			gerritReposD,
			gerritRepo,
			commit
		);
		if (currentChange) {
			await env.openExternal(
				Uri.parse(
					`${basePath}/refs/changes/${String(
						// For some reason this needs to be the last 2 digits of the change number...
						// Not really sure why
						currentChange.changeNumber
					).slice(-2)}/${currentChange.changeNumber}/${
						currentChange.revision
					}/${relativeFilePath}${lineNumber}`,
					true
				)
			);
			return;
		}
	}

	// Just use commit hash
	await env.openExternal(
		Uri.parse(
			`${basePath}/${commit.hash}/${relativeFilePath}${lineNumber}`,
			true
		)
	);
}

async function getCurrentChange(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	commit: GitCommit
): Promise<{
	changeNumber: number;
	revision: number;
} | null> {
	// Now comes the magical part. If we're not on master we want to figure out on what gerrit
	// change we are and link to the change & patchset.
	const change = await GerritChange.getCurrentChangeOnce(
		gerritReposD,
		gerritRepo,
		[],
		{
			cachedID: true,
			allowFail: true,
		}
	);
	if (!change) {
		return null;
	}

	const revisionsForChange = await change.allRevisions();
	if (!revisionsForChange) {
		return null;
	}

	for (const revision of Object.values(revisionsForChange)) {
		if (revision.revisionID === commit.hash) {
			return {
				changeNumber: change.number,
				revision: revision.number,
			};
		}
	}

	return null;
}
