import {
	DEFAULT_GIT_REVIEW_FILE,
	getGitReviewFileCached,
} from '../credentials/gitReviewFile';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { GitCommit, getLastCommits } from '../git/gitCLI';
import { Uri, env, window, workspace } from 'vscode';
import { getCurrentBranch } from '../git/git';
import * as path from 'path';

export async function openOnGitiles(
	permalink: boolean,
	uri: Uri,
	line?: number
): Promise<void> {
	const gitReviewFile = await getGitReviewFileCached();
	if (!gitReviewFile) {
		void window.showErrorMessage(
			'Failed to find .gitreview file, which is used to determine URL'
		);
		return;
	}
	if (!workspace.workspaceFolders?.[0]) {
		void window.showErrorMessage('Failed to find workspace folder');
		return;
	}

	const mainBranch =
		gitReviewFile.branch ??
		gitReviewFile.defaultbranch ??
		DEFAULT_GIT_REVIEW_FILE.branch;

	const branch = await getCurrentBranch();

	let project = gitReviewFile.project;
	if (project.endsWith('.git')) {
		project = project.slice(0, -'.git'.length);
	}
	const basePath = `https://${gitReviewFile.host}/plugins/gitiles/${project}/+`;
	const relativeFilePath = path.relative(
		workspace.workspaceFolders[0].uri.fsPath,
		uri.fsPath
	);

	// Find the revision with the same hash as the current commit
	const commit = (await getLastCommits(1))[0];
	if (!commit) {
		void window.showErrorMessage('Failed to find current commit hash');
		return;
	}

	const lineNumber = line ? `#${line}` : '';
	if (!permalink) {
		if (!branch || !branch.includes('/')) {
			// If we're on some one-word branch, link to that branch itself
			await env.openExternal(
				Uri.parse(
					`${basePath}/${mainBranch}/${relativeFilePath}${lineNumber}`,
					true
				)
			);
			return;
		}

		const currentChange = await getCurrentChange(commit);
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

async function getCurrentChange(commit: GitCommit): Promise<{
	changeNumber: number;
	revision: number;
} | null> {
	// Now comes the magical part. If we're not on master we want to figure out on what gerrit
	// change we are and link to the change & patchset.
	const change = await GerritChange.getCurrentChangeOnce([], {
		cachedID: true,
		allowFail: true,
	});
	if (!change) {
		return null;
	}

	const revisionsForChange = await change.revisions();
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
