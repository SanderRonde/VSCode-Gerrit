import {
	writeMcpConfig,
	isMcpConfigured,
	GerritCredentials,
} from '../mcp/mcpManager';
import { getGerritURLFromReviewFile } from '../credentials/enterCredentials';
import { log, getOutputChannel, showOutputChannel } from '../util/log';
import { getGitReviewFileCached } from '../credentials/gitReviewFile';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { Repository } from '../../types/vscode-extension-git';
import { window, workspace, ProgressLocation } from 'vscode';
import { getCurrentChangeIDCached } from '../git/commit';
import { GerritSecrets } from '../credentials/secrets';
import { getConfiguration } from '../vscode/config';
import { getDefaultModel } from './modelSelector';
import { spawn } from 'child_process';

const SEPARATOR = '\u2500'.repeat(60);

export interface SuggestionComment {
	filePath: string;
	line?: number;
	message: string;
	commentId: string;
	changeID?: string;
}

async function extractCredentials(
	gerritRepo: Repository
): Promise<GerritCredentials | null> {
	const config = getConfiguration();
	const gitReviewFile = await getGitReviewFileCached(gerritRepo);

	const url = getGerritURLFromReviewFile(gitReviewFile);
	if (!url) {
		return null;
	}

	const username = config.get('gerrit.auth.username') ?? '';
	const password = await GerritSecrets.getForUrlOrWorkspace(
		'password',
		url,
		workspace.workspaceFolders?.[0]?.uri
	);
	const cookie = await GerritSecrets.getForUrlOrWorkspace(
		'cookie',
		url,
		workspace.workspaceFolders?.[0]?.uri
	);
	const authPrefix = config.get('gerrit.customAuthUrlPrefix', 'a/');

	if (!username && !password && !cookie) {
		return null;
	}

	return {
		url,
		username,
		password: password ?? '',
		authCookie: cookie ?? undefined,
		authPrefix,
	};
}

async function ensureMcpConfig(
	gerritRepo: Repository,
	extensionPath: string
): Promise<boolean> {
	if (isMcpConfigured()) {
		return true;
	}
	const credentials = await extractCredentials(gerritRepo);
	if (!credentials) {
		void window.showErrorMessage(
			'Could not extract Gerrit credentials. ' +
				'Please configure them via "Gerrit: ' +
				'Enter Credentials".'
		);
		return false;
	}
	return await writeMcpConfig(extensionPath, credentials);
}

async function isChangeCheckedOut(changeID: string): Promise<boolean> {
	const localChangeId = await getCurrentChangeIDCached();
	if (!localChangeId) {
		return false;
	}
	const change = await GerritChange.getChangeOnce(changeID, []);
	if (!change) {
		return false;
	}
	return localChangeId === change.change_id;
}

function buildSuggestionPrompt(
	changeNumber: string,
	comments: SuggestionComment[]
): string {
	const parts: string[] = [
		`You are fixing code based on review comments on Gerrit change ${changeNumber}.`,
		'For each comment below, implement the suggested fix in the local file.',
		'After implementing each fix, use the gerrit_reply_to_comment MCP tool to mark the comment as resolved with message "Done".',
		'',
	];

	for (let i = 0; i < comments.length; i++) {
		const c = comments[i];
		parts.push(`Comment ${i + 1}:`);
		parts.push(`- File: ${c.filePath}`);
		if (c.line) {
			parts.push(`- Line: ${c.line}`);
		}
		parts.push(`- Comment ID: ${c.commentId}`);
		parts.push(`- Message: ${c.message}`);
		parts.push('');
	}

	return parts.join('\n');
}

interface StreamEvent {
	type?: string;
	subtype?: string;
	model?: string;
	message?: {
		role?: string;
		content?: Array<{
			type?: string;
			text?: string;
		}>;
	};
	result?: string;
	duration_ms?: number;
	is_error?: boolean;
}

function processStreamEvent(
	jsonLine: string,
	oc: ReturnType<typeof getOutputChannel>,
	progress: {
		report: (v: { message?: string }) => void;
	}
): void {
	let evt: StreamEvent;
	try {
		evt = JSON.parse(jsonLine) as StreamEvent;
	} catch {
		if (oc) {
			oc.appendLine(jsonLine);
		}
		return;
	}

	switch (evt.type) {
		case 'system':
			if (evt.subtype === 'init' && oc) {
				if (evt.model) {
					oc.appendLine(`Agent model: ${evt.model}`);
				}
				oc.appendLine('');
				progress.report({
					message:
						'Agent started. Check output ' +
						'panel (Gerrit) for details.',
				});
			}
			break;

		case 'assistant': {
			const text = evt.message?.content?.[0]?.text;
			if (text && oc) {
				oc.append(text);
			}
			break;
		}

		case 'tool_call':
		case 'tool_result': {
			const text = evt.message?.content?.[0]?.text;
			if (text && oc) {
				oc.appendLine(`[tool] ${text.substring(0, 200)}`);
			}
			break;
		}

		case 'result':
			if (oc) {
				oc.appendLine('');
				if (evt.duration_ms) {
					const secs = Math.round(evt.duration_ms / 1000);
					oc.appendLine(`Agent finished (${secs}s)`);
				}
			}
			progress.report({
				message: 'Agent finished',
			});
			break;
	}
}

function invokeCursorAgentForFix(
	prompt: string,
	progress: {
		report: (v: { message?: string; increment?: number }) => void;
	},
	token: {
		isCancellationRequested: boolean;
		onCancellationRequested: (cb: () => void) => { dispose: () => void };
	}
): Promise<void> {
	const model = getDefaultModel();
	const args = [
		'agent',
		'--print',
		'--output-format',
		'stream-json',
		'--stream-partial-output',
		'--approve-mcps',
		'--trust',
		'--force',
	];
	if (model) {
		args.push('--model', model);
	}

	const cwd = workspace.workspaceFolders?.[0]?.uri.fsPath;

	const oc = getOutputChannel();
	if (oc) {
		oc.clear();
		showOutputChannel();
		oc.appendLine('=== Accept Suggestion ===');
		oc.appendLine('');
		oc.appendLine(`Model: ${model || '(auto)'}`);
		oc.appendLine('');
		oc.appendLine(SEPARATOR);
		oc.appendLine('');
	}

	log('Invoking cursor agent for suggestion fix');

	const TIMEOUT_MS = 5 * 60 * 1000;
	const startTime = Date.now();

	return new Promise<void>((resolve, reject) => {
		let settled = false;
		const settle = (
			fn: typeof resolve | typeof reject,
			val?: unknown
		): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			(fn as (v?: unknown) => void)(val);
		};

		const proc = spawn('cursor', args, {
			cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		proc.stdout.setEncoding('utf8');
		proc.stderr.setEncoding('utf8');

		if (proc.stdin) {
			proc.stdin.write(prompt);
			proc.stdin.end();
		}

		if (oc) {
			oc.appendLine(`PID: ${proc.pid ?? 'unknown'}`);
			oc.appendLine('');
		}

		const timer = setTimeout(() => {
			log('Agent timed out after 5 minutes');
			if (oc) {
				oc.appendLine('');
				oc.appendLine(SEPARATOR);
				oc.appendLine('[Timed out after 5 minutes]');
			}
			proc.kill();
			settle(reject, new Error('Timed out after 5 minutes'));
		}, TIMEOUT_MS);

		let buffer = '';

		proc.stdout.on('data', (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) {
					continue;
				}
				processStreamEvent(trimmed, oc, progress);
			}
		});

		proc.stderr.on('data', (chunk: string) => {
			if (oc) {
				oc.appendLine('[stderr] ' + chunk.trimEnd());
			}
		});

		proc.on('error', (err) => {
			if (oc) {
				oc.appendLine('');
				oc.appendLine(SEPARATOR);
				oc.appendLine('[ERROR] ' + err.message);
			}
			settle(
				reject,
				new Error(
					'Cursor CLI failed to start: ' +
						err.message +
						'. Check that "cursor" command ' +
						'is installed and available.'
				)
			);
		});

		const cancelSub = token.onCancellationRequested(() => {
			log('Suggestion fix cancelled by user');
			if (oc) {
				oc.appendLine('');
				oc.appendLine(SEPARATOR);
				oc.appendLine('[Cancelled by user]');
			}
			proc.kill();
			settle(reject, new Error('Cancelled'));
		});

		proc.on('exit', (code) => {
			cancelSub.dispose();

			if (buffer.trim()) {
				processStreamEvent(buffer.trim(), oc, progress);
			}

			const elapsed = Math.round((Date.now() - startTime) / 1000);
			if (oc) {
				oc.appendLine('');
				oc.appendLine(SEPARATOR);
				oc.appendLine(`[Completed in ${elapsed}s]`);
			}
			if (code === 0 || code === null) {
				log('Cursor agent completed fix');
				settle(resolve);
			} else {
				settle(
					reject,
					new Error('Cursor agent exited with code ' + String(code))
				);
			}
		});

		if (token.isCancellationRequested) {
			proc.kill();
		}
	});
}

export async function acceptSuggestion(
	comment: {
		changeID: string;
		filePath: string;
		line?: number;
		message?: string;
		id: string;
		thread?: {
			comments: ReadonlyArray<{
				message?: string;
				author?: { name?: string };
			}>;
		} | null;
	},
	gerritRepo: Repository,
	extensionPath: string
): Promise<void> {
	const changeID = comment.changeID;

	const checkedOut = await isChangeCheckedOut(changeID);
	if (!checkedOut) {
		void window.showWarningMessage(
			'Change is not checked out locally. ' +
				'Please checkout the change first.'
		);
		return;
	}

	const change = await GerritChange.getChangeOnce(changeID, []);
	if (!change) {
		void window.showErrorMessage('Could not load change details.');
		return;
	}

	const mcpOk = await ensureMcpConfig(gerritRepo, extensionPath);
	if (!mcpOk) {
		void window.showErrorMessage('Failed to configure MCP tools.');
		return;
	}

	const threadMessages =
		comment.thread?.comments
			.map((c) => {
				const author = c.author?.name ?? 'Unknown';
				return `${author}: ${c.message ?? ''}`;
			})
			.join('\n') ??
		comment.message ??
		'';

	const items: SuggestionComment[] = [
		{
			filePath: comment.filePath,
			line: comment.line,
			message: threadMessages,
			commentId: comment.id,
			changeID,
		},
	];

	const prompt = buildSuggestionPrompt(String(change.number), items);

	await window.withProgress(
		{
			location: ProgressLocation.Notification,
			title: 'Accepting Suggestion',
			cancellable: true,
		},
		async (progress, token) => {
			try {
				await invokeCursorAgentForFix(prompt, progress, token);
				void window.showInformationMessage(
					'Suggestion applied and comment resolved.'
				);
			} catch (e) {
				if (token.isCancellationRequested) {
					return;
				}
				const msg = e instanceof Error ? e.message : String(e);
				log('Accept suggestion failed: ' + msg);
				void window.showErrorMessage(
					'Accept suggestion failed: ' + msg
				);
			}
		}
	);
}

export async function acceptMultipleSuggestions(
	comments: SuggestionComment[],
	gerritRepo: Repository,
	extensionPath: string,
	changeNumber: string
): Promise<void> {
	if (!comments.length) {
		return;
	}

	const changeID = comments[0].changeID ?? changeNumber;

	const checkedOut = await isChangeCheckedOut(changeID);
	if (!checkedOut) {
		void window.showWarningMessage(
			'Change is not checked out locally. ' +
				'Please checkout the change first.'
		);
		return;
	}

	const mcpOk = await ensureMcpConfig(gerritRepo, extensionPath);
	if (!mcpOk) {
		void window.showErrorMessage('Failed to configure MCP tools.');
		return;
	}

	const change = await GerritChange.getChangeOnce(changeID, []);

	const prompt = buildSuggestionPrompt(
		change ? String(change.number) : changeNumber,
		comments
	);

	await window.withProgress(
		{
			location: ProgressLocation.Notification,
			title: 'Accepting Suggestions',
			cancellable: true,
		},
		async (progress, token) => {
			try {
				await invokeCursorAgentForFix(prompt, progress, token);
				void window.showInformationMessage(
					`Applied ${comments.length} suggestion(s) ` +
						'and resolved comments.'
				);
			} catch (e) {
				if (token.isCancellationRequested) {
					return;
				}
				const msg = e instanceof Error ? e.message : String(e);
				log('Accept suggestions failed: ' + msg);
				void window.showErrorMessage(
					'Accept suggestions failed: ' + msg
				);
			}
		}
	);
}
