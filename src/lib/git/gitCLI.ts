import {
	ChildProcessWithoutNullStreams,
	exec,
	ExecException,
	ExecOptions,
	spawn,
	SpawnOptionsWithoutStdio,
} from 'child_process';
import { Repository } from '../../types/vscode-extension-git';
import { log } from '../util/log';

export interface GitCommit {
	hash: string;
	message: string;
}

export async function execAsync(
	cmd: string,
	options?: ExecOptions
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		exec(cmd, options, (err, stdout, stderr) => {
			if (err) {
				log(`Tried to run "${cmd}", but failed`);
				log(`Stdout: ${stdout.toString()}`);
				log(`Stderr: ${stderr.toString()}`);
				reject({
					stdout,
					stderr,
					err,
				});
			} else {
				resolve(stdout.toString());
			}
		});
	});
}

export async function tryExecAsync(
	cmd: string,
	options?: ExecOptions & {
		silent?: boolean;
	}
): Promise<{
	success: boolean;
	stdout: string;
	stderr: string;
	err: ExecException | null;
}> {
	return new Promise<{
		success: boolean;
		stdout: string;
		stderr: string;
		err: Error | null;
	}>((resolve) => {
		exec(cmd, options, (err, stdout, stderr) => {
			if (err && !options?.silent) {
				log(`Tried to run "${cmd}", but failed`);
				log(`Stdout: ${stdout.toString()}`);
				log(`Stderr: ${stderr.toString()}`);
				log(`Error: ${err.message}`);
			}
			resolve({
				success: !err,
				stdout: stdout.toString(),
				stderr: stderr.toString(),
				err,
			});
		});
	});
}

export function execAndMonitor(
	cmd: string,
	onStdout: (
		stdout: string,
		process: ChildProcessWithoutNullStreams
	) => void | Promise<void>,
	options?: SpawnOptionsWithoutStdio & {
		silent?: boolean;
	}
): Promise<{
	success: boolean;
	stdout: string;
	stderr: string;
	err: ExecException | null;
}> {
	let stdout: string = '';
	let stderr: string = '';
	const process = spawn(cmd, options);
	process.stdout.on('data', (chunk: string | Buffer) => {
		stdout += chunk.toString();
		void onStdout(stdout, process);
	});
	process.stderr.on('data', (chunk: string | Buffer) => {
		stderr += chunk.toString();
	});
	return new Promise<{
		success: boolean;
		stdout: string;
		stderr: string;
		err: ExecException | null;
	}>((resolve) => {
		process.on('error', (err) => {
			resolve({
				success: false,
				stdout,
				stderr,
				err,
			});
		});
		process.on('exit', () => {
			resolve({
				success: true,
				stdout,
				stderr,
				err: null,
			});
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

export async function getLastCommits(
	gerritRepo: Repository,
	count: number
): Promise<GitCommit[]> {
	// We use the native `git log` command here instead of the actual
	// API because the API shows a loading icon on the status bar every 5s
	// which is quite annoying
	try {
		const stdout = await execAsync(
			`git log --format='${COMMIT_FORMAT}' -z -n ${count}`,
			{
				cwd: gerritRepo.rootUri.fsPath,
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
