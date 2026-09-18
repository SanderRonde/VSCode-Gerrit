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
		args?: string[];
		timeout?: number;
	}
): Promise<{
	success: boolean;
	stdout: string;
	stderr: string;
	err: ExecException | null;
}> {
	let stdout: string = '';
	let stderr: string = '';
	const { timeout, silent, args, ...spawnOptions } = options ?? {};
	const process = spawn(cmd, args ?? [], spawnOptions);
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
		let settled = false;
		const finish = (result: {
			success: boolean;
			stdout: string;
			stderr: string;
			err: ExecException | null;
		}): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			resolve(result);
		};
		const timeoutHandle =
			typeof timeout === 'number'
				? setTimeout(() => {
						if (!process.killed) {
							process.kill();
						}
						if (!silent) {
							log(
								`Tried to run "${cmd}", but timed out after ${timeout}ms`
							);
						}
						finish({
							success: false,
							stdout,
							stderr,
							err: Object.assign(
								new Error(
									`Process timed out after ${timeout}ms`
								),
								{
									killed: true,
								}
							),
						});
					}, timeout)
				: undefined;
		process.on('error', (err) => {
			finish({
				success: false,
				stdout,
				stderr,
				err,
			});
		});
		process.on('exit', (code) => {
			finish({
				success: code === 0,
				stdout,
				stderr,
				err:
					code === 0
						? null
						: Object.assign(
								new Error(
									`Process exited with code ${String(code)}`
								),
								{
									code: code ?? undefined,
								}
							),
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
