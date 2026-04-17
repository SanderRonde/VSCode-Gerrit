/**
 * Standalone Gerrit MCP server using raw JSON-RPC over stdio.
 * Run as: node out/lib/mcp/gerritMcpServer.js
 *
 * Reads credentials from env vars:
 *   GERRIT_URL, GERRIT_USERNAME, GERRIT_PASSWORD,
 *   GERRIT_AUTH_COOKIE, GERRIT_AUTH_PREFIX
 *
 * Must NOT import anything from VSCode or extension
 * modules that depend on VSCode.
 */

import * as readline from 'readline';
import got from 'got/dist/source';

// ── Env config ──────────────────────────────────────

const GERRIT_URL = process.env.GERRIT_URL ?? '';
const GERRIT_USERNAME = process.env.GERRIT_USERNAME ?? '';
const GERRIT_PASSWORD = process.env.GERRIT_PASSWORD ?? '';
const GERRIT_AUTH_COOKIE = process.env.GERRIT_AUTH_COOKIE ?? '';
const GERRIT_AUTH_PREFIX = process.env.GERRIT_AUTH_PREFIX ?? 'a/';

const MAGIC_PREFIX = ")]}'";

// ── Gerrit HTTP client ──────────────────────────────

function gerritHeaders(withContent: boolean): Record<string, string> {
	const h: Record<string, string> = {};
	if (withContent) {
		h['Content-Type'] = 'application/json';
	}
	if (GERRIT_USERNAME && GERRIT_PASSWORD) {
		h['Authorization'] =
			'Basic ' +
			Buffer.from(`${GERRIT_USERNAME}:${GERRIT_PASSWORD}`).toString(
				'base64'
			);
	}
	return h;
}

function gerritUrl(path: string): string {
	const base = GERRIT_URL.endsWith('/') ? GERRIT_URL : GERRIT_URL + '/';
	return base + GERRIT_AUTH_PREFIX + path;
}

function stripMagic(body: string): string {
	if (body.startsWith(MAGIC_PREFIX)) {
		return body.slice(MAGIC_PREFIX.length).trim();
	}
	return body.trim();
}

async function gerritGet(path: string): Promise<unknown> {
	const url = gerritUrl(path);
	const cookieJar = buildCookieJar();
	const resp = await got(url, {
		method: 'GET',
		headers: gerritHeaders(false),
		cookieJar,
		https: { rejectUnauthorized: false },
	});
	return JSON.parse(stripMagic(resp.body));
}

async function gerritGetRaw(path: string): Promise<string> {
	const url = gerritUrl(path);
	const cookieJar = buildCookieJar();
	const resp = await got(url, {
		method: 'GET',
		headers: gerritHeaders(false),
		cookieJar,
		https: { rejectUnauthorized: false },
	});
	return resp.body;
}

async function gerritPut(path: string, body: unknown): Promise<unknown> {
	const url = gerritUrl(path);
	const cookieJar = buildCookieJar();
	const resp = await got(url, {
		method: 'PUT',
		headers: gerritHeaders(true),
		body: JSON.stringify(body),
		cookieJar,
		https: { rejectUnauthorized: false },
	});
	return JSON.parse(stripMagic(resp.body));
}

function buildCookieJar():
	| { getCookieString: () => Promise<string>; setCookie: () => Promise<void> }
	| undefined {
	if (!GERRIT_AUTH_COOKIE) {
		return undefined;
	}
	const cookieString = `GerritAccount=${GERRIT_AUTH_COOKIE}`;
	return {
		getCookieString: () => Promise.resolve(cookieString),
		setCookie: () => Promise.resolve(),
	};
}

// ── MCP Tool definitions ────────────────────────────

interface ToolDef {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
	{
		name: 'gerrit_get_change',
		description:
			'Get change metadata including subject, owner, ' +
			'branch, status, commit message, insertions, ' +
			'and deletions.',
		inputSchema: {
			type: 'object',
			properties: {
				changeNumber: {
					type: 'string',
					description: 'Gerrit change number',
				},
			},
			required: ['changeNumber'],
		},
	},
	{
		name: 'gerrit_get_changed_files',
		description:
			'List all files changed in the current patchset ' +
			'with lines inserted/deleted.',
		inputSchema: {
			type: 'object',
			properties: {
				changeNumber: {
					type: 'string',
					description: 'Gerrit change number',
				},
			},
			required: ['changeNumber'],
		},
	},
	{
		name: 'gerrit_get_file_content',
		description:
			'Get the full content of a file in the current ' +
			'patchset revision.',
		inputSchema: {
			type: 'object',
			properties: {
				changeNumber: {
					type: 'string',
					description: 'Gerrit change number',
				},
				filePath: {
					type: 'string',
					description: 'Path to the file',
				},
			},
			required: ['changeNumber', 'filePath'],
		},
	},
	{
		name: 'gerrit_get_comments',
		description:
			'Get all published comments on a change, ' + 'grouped by file.',
		inputSchema: {
			type: 'object',
			properties: {
				changeNumber: {
					type: 'string',
					description: 'Gerrit change number',
				},
			},
			required: ['changeNumber'],
		},
	},
	{
		name: 'gerrit_get_draft_comments',
		description: 'Get all existing draft comments on a change.',
		inputSchema: {
			type: 'object',
			properties: {
				changeNumber: {
					type: 'string',
					description: 'Gerrit change number',
				},
			},
			required: ['changeNumber'],
		},
	},
	{
		name: 'gerrit_post_draft_comment',
		description:
			'Post a new draft comment on a specific file ' +
			'and line. Use /PATCHSET_LEVEL as filePath ' +
			'for patchset-level comments.',
		inputSchema: {
			type: 'object',
			properties: {
				changeNumber: {
					type: 'string',
					description: 'Gerrit change number',
				},
				filePath: {
					type: 'string',
					description: 'File path or /PATCHSET_LEVEL',
				},
				line: {
					type: 'number',
					description: 'Line number (omit for file-level)',
				},
				message: {
					type: 'string',
					description: 'Comment text',
				},
				unresolved: {
					type: 'boolean',
					description: 'Mark as unresolved',
				},
			},
			required: ['changeNumber', 'filePath', 'message'],
		},
	},
	{
		name: 'gerrit_reply_to_comment',
		description:
			'Reply to an existing comment thread. Uses ' +
			'in_reply_to to chain comments.',
		inputSchema: {
			type: 'object',
			properties: {
				changeNumber: {
					type: 'string',
					description: 'Gerrit change number',
				},
				filePath: {
					type: 'string',
					description: 'File path of the thread',
				},
				message: {
					type: 'string',
					description: 'Reply text',
				},
				inReplyTo: {
					type: 'string',
					description: 'ID of comment to reply to',
				},
			},
			required: ['changeNumber', 'filePath', 'message', 'inReplyTo'],
		},
	},
];

// ── Tool handlers ───────────────────────────────────

type ToolArgs = Record<string, unknown>;

async function handleTool(name: string, args: ToolArgs): Promise<string> {
	switch (name) {
		case 'gerrit_get_change':
			return handleGetChange(args);
		case 'gerrit_get_changed_files':
			return handleGetChangedFiles(args);
		case 'gerrit_get_file_content':
			return handleGetFileContent(args);
		case 'gerrit_get_comments':
			return handleGetComments(args);
		case 'gerrit_get_draft_comments':
			return handleGetDraftComments(args);
		case 'gerrit_post_draft_comment':
			return handlePostDraft(args);
		case 'gerrit_reply_to_comment':
			return handleReplyToComment(args);
		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

async function handleGetChange(args: ToolArgs): Promise<string> {
	const cn = String(args.changeNumber);
	const data = await gerritGet(
		`changes/${cn}/detail/` +
			'?o=CURRENT_REVISION&o=CURRENT_COMMIT' +
			'&o=DETAILED_ACCOUNTS'
	);
	return JSON.stringify(data, null, 2);
}

async function handleGetChangedFiles(args: ToolArgs): Promise<string> {
	const cn = String(args.changeNumber);
	const data = await gerritGet(`changes/${cn}/revisions/current/files`);
	return JSON.stringify(data, null, 2);
}

async function handleGetFileContent(args: ToolArgs): Promise<string> {
	const cn = String(args.changeNumber);
	const fp = String(args.filePath);
	const encoded = encodeURIComponent(fp);
	const raw = await gerritGetRaw(
		`changes/${cn}/revisions/current/` + `files/${encoded}/content`
	);
	const decoded = Buffer.from(raw, 'base64').toString('utf-8');
	return decoded;
}

async function handleGetComments(args: ToolArgs): Promise<string> {
	const cn = String(args.changeNumber);
	const data = await gerritGet(`changes/${cn}/comments/`);
	return JSON.stringify(data, null, 2);
}

async function handleGetDraftComments(args: ToolArgs): Promise<string> {
	const cn = String(args.changeNumber);
	const data = await gerritGet(`changes/${cn}/drafts/`);
	return JSON.stringify(data, null, 2);
}

async function handlePostDraft(args: ToolArgs): Promise<string> {
	const cn = String(args.changeNumber);
	const body: Record<string, unknown> = {
		path: String(args.filePath),
		message: String(args.message),
		unresolved: args.unresolved !== false,
	};
	if (typeof args.line === 'number') {
		body.line = args.line;
	}
	const data = await gerritPut(
		`changes/${cn}/revisions/current/drafts`,
		body
	);
	return JSON.stringify(data, null, 2);
}

async function handleReplyToComment(args: ToolArgs): Promise<string> {
	const cn = String(args.changeNumber);
	const body = {
		path: String(args.filePath),
		message: String(args.message),
		in_reply_to: String(args.inReplyTo),
		unresolved: false,
	};
	const data = await gerritPut(
		`changes/${cn}/revisions/current/drafts`,
		body
	);
	return JSON.stringify(data, null, 2);
}

// ── JSON-RPC protocol ───────────────────────────────

interface JsonRpcRequest {
	jsonrpc: string;
	id?: number | string | null;
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string };
}

function makeResult(
	id: number | string | null,
	result: unknown
): JsonRpcResponse {
	return { jsonrpc: '2.0', id, result };
}

function makeError(
	id: number | string | null,
	code: number,
	message: string
): JsonRpcResponse {
	return {
		jsonrpc: '2.0',
		id,
		error: { code, message },
	};
}

function sendResponse(resp: JsonRpcResponse): void {
	const json = JSON.stringify(resp);
	process.stdout.write(json + '\n');
}

async function handleMessage(msg: JsonRpcRequest): Promise<void> {
	if (msg.method === 'notifications/initialized') {
		return;
	}

	if (!msg.id && msg.id !== 0) {
		return;
	}

	try {
		switch (msg.method) {
			case 'initialize':
				sendResponse(
					makeResult(msg.id, {
						protocolVersion: '2024-11-05',
						serverInfo: {
							name: 'gerrit-review',
							version: '1.0.0',
						},
						capabilities: { tools: {} },
					})
				);
				break;

			case 'tools/list':
				sendResponse(
					makeResult(msg.id, {
						tools: TOOLS,
					})
				);
				break;

			case 'tools/call': {
				const p = msg.params as {
					name: string;
					arguments?: ToolArgs;
				};
				try {
					const text = await handleTool(p.name, p.arguments ?? {});
					sendResponse(
						makeResult(msg.id, {
							content: [{ type: 'text', text }],
						})
					);
				} catch (e) {
					const errMsg = e instanceof Error ? e.message : String(e);
					sendResponse(
						makeResult(msg.id, {
							content: [{ type: 'text', text: errMsg }],
							isError: true,
						})
					);
				}
				break;
			}

			default:
				sendResponse(
					makeError(msg.id, -32601, `Method not found: ${msg.method}`)
				);
		}
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		sendResponse(makeError(msg.id, -32603, errMsg));
	}
}

// ── Main ────────────────────────────────────────────

function main(): void {
	if (!GERRIT_URL) {
		process.stderr.write('GERRIT_URL env var is required\n');
		process.exit(1);
	}

	const rl = readline.createInterface({
		input: process.stdin,
		terminal: false,
	});

	rl.on('line', (line: string) => {
		const trimmed = line.trim();
		if (!trimmed) {
			return;
		}
		try {
			const msg = JSON.parse(trimmed) as JsonRpcRequest;
			void handleMessage(msg);
		} catch {
			// Ignore malformed lines
		}
	});

	rl.on('close', () => {
		process.exit(0);
	});
}

main();
