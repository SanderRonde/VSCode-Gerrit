import { exec, ExecOptions } from 'child_process';
import { getGitAPI } from './git';
import { log } from './log';

export interface GitCommit {
	hash: string;
	message: string;
}

async function execAsync(cmd: string, options?: ExecOptions): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		exec(cmd, options, (err, stdout, stderr) => {
			if (err) {
				reject(stderr);
			} else {
				resolve(stdout.toString());
			}
		});
	});
}

/**
 * Current format:
 *
 * Hash(newline)
 * Body(null-character)
 */
const COMMIT_FORMAT = '%H%n%B';
// eslint-disable-next-line no-control-regex
const COMMIT_REGEX = /(.*)\n([^]*?)(?:\x00)/gm;

export async function getLastCommits(count: number): Promise<GitCommit[]> {
	const api = getGitAPI();

	if (!api || api.repositories.length !== 1) {
		return [];
	}

	// We use the native `git log` command here instead of the actual
	// API because the API shows a loading icon on the status bar every 5s
	// which is quite annoying
	try {
		const stdout = await execAsync(
			`git log --format='${COMMIT_FORMAT}' -z -n ${count}`,
			{
				cwd: api.repositories[0].rootUri.fsPath,
			}
		);
		let match = COMMIT_REGEX.exec(stdout);
		if (!match) {
			return [];
		}

		const commits: GitCommit[] = [];
		do {
			const [, hash, body] = match;

			commits.push({
				hash,
				message: body.trimEnd(),
			});
			match = COMMIT_REGEX.exec(stdout);
		} while (match);

		return commits;
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
		log(`Failed to get last ${count} commits: ${e}`);
		return [];
	}
}
