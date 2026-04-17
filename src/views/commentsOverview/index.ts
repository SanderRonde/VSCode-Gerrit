import {
	Uri,
	ViewColumn,
	window,
	workspace,
	commands as vscodeCommands,
	WebviewPanel,
	CommentThreadCollapsibleState,
} from 'vscode';
import {
	acceptMultipleSuggestions,
	SuggestionComment,
} from '../../lib/ai-review/commentFixer';
import {
	GerritComment,
	GerritDraftComment,
} from '../../lib/gerrit/gerritAPI/gerritComment';
import {
	GerritChange,
	CommentMap,
} from '../../lib/gerrit/gerritAPI/gerritChange';
import { FileTreeView } from '../activityBar/changes/changeTreeView/fileTreeView';
import { GerritFile } from '../../lib/gerrit/gerritAPI/gerritFile';
import { getAPIForSubscription } from '../../lib/gerrit/gerritAPI';
import { CommentManager } from '../../providers/commentProvider';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { buildHTML, OverviewComment, FileGroup } from './html';
import { Repository } from '../../types/vscode-extension-git';
import { log } from '../../lib/util/log';

let activePanel: WebviewPanel | null = null;
let activeChangeNumber: string = '';
let activeGerritRepo: Repository | null = null;
let activeChange: GerritChange | null = null;
let activePatchSetNumber: number = 0;
let activeExtensionPath: string = '';

export function setExtensionPath(path: string): void {
	activeExtensionPath = path;
}

export async function showCommentsOverview(
	changeNumber: string,
	gerritRepo: Repository
): Promise<void> {
	activeChangeNumber = changeNumber;
	activeGerritRepo = gerritRepo;

	if (activePanel) {
		activePanel.reveal(ViewColumn.One);
		await updatePanel(activePanel, changeNumber, gerritRepo);
		return;
	}

	const panel = window.createWebviewPanel(
		'gerritCommentsOverview',
		`Review Comments - Change ${changeNumber}`,
		ViewColumn.One,
		{ enableScripts: true }
	);

	activePanel = panel;
	panel.onDidDispose(() => {
		activePanel = null;
		activeChangeNumber = '';
		activeGerritRepo = null;
		activeChange = null;
		activePatchSetNumber = 0;
	});

	panel.webview.onDidReceiveMessage(
		async (msg: {
			command: string;
			filePath?: string;
			line?: number;
			patchSet?: number;
			comments?: Array<{
				filePath: string;
				line?: number;
				message: string;
				commentId: string;
			}>;
		}) => {
			if (msg.command === 'navigate' && activeGerritRepo) {
				await navigateToComment(
					msg.filePath ?? '',
					msg.line,
					msg.patchSet,
					activeGerritRepo
				);
			} else if (
				msg.command === 'acceptSuggestions' &&
				msg.comments &&
				activeGerritRepo
			) {
				const items: SuggestionComment[] = msg.comments.map((c) => ({
					filePath: c.filePath,
					line: c.line,
					message: c.message,
					commentId: c.commentId,
					changeID: activeChange?.changeID,
				}));
				await acceptMultipleSuggestions(
					items,
					activeGerritRepo,
					activeExtensionPath,
					activeChangeNumber
				);
			}
		}
	);

	await updatePanel(panel, changeNumber, gerritRepo);
}

async function updatePanel(
	panel: WebviewPanel,
	changeNumber: string,
	gerritRepo: Repository
): Promise<void> {
	const change = await GerritChange.getChangeOnce(changeNumber, [
		GerritAPIWith.ALL_REVISIONS,
		GerritAPIWith.ALL_FILES,
	]);
	if (!change) {
		panel.webview.html = buildHTML(changeNumber, [], [], []);
		return;
	}

	activeChange = change;

	const currentRevision = await change.getCurrentRevision();
	activePatchSetNumber = currentRevision?.number ?? 0;

	const commentsSub = await GerritChange.getAllComments(change.changeID);
	const commentsMap = await commentsSub.getValue();

	// Await cache warms so navigation never
	// needs to re-fetch under a different key.
	await warmCacheShortId(change.change_id);
	await warmChangeCacheShortId(change.change_id);

	// Warm change subscription with the exact
	// params createDiffCommand will use.
	await (await getAPIForSubscription())
		.getChange(change.changeID, null)
		.getValue();

	// Pre-fetch file diff content (old + new)
	// for every file with comments so that
	// createDiffCommand hits fileCache only.
	if (currentRevision) {
		await prefetchFileDiffContent(change, commentsMap, currentRevision);
	}

	const fileContents = await fetchFileContents(
		change,
		commentsMap,
		gerritRepo
	);

	const { draftGroups, unresolvedGroups, olderPatchsetGroups } =
		groupComments(commentsMap, fileContents, activePatchSetNumber);

	panel.webview.html = buildHTML(
		changeNumber,
		draftGroups,
		unresolvedGroups,
		olderPatchsetGroups
	);
}

/**
 * Warm the comments subscription cache under
 * the short Change-Id (Ixx) key so that
 * loadComments on local files (which resolves
 * changeID via getCurrentChangeIDCached) hits
 * the cache.
 */
async function warmCacheShortId(shortId: string): Promise<void> {
	try {
		const sub = await GerritChange.getAllComments(shortId);
		await sub.getValue();
	} catch {
		// ignore
	}
}

/**
 * Warm the change subscription cache under the
 * short Ixx key so that getFileFromOpenDocument
 * -> getCurrentChangeOnce hits the cache.
 */
async function warmChangeCacheShortId(shortId: string): Promise<void> {
	try {
		await GerritChange.getChangeOnce(shortId, [
			GerritAPIWith.CURRENT_REVISION,
			GerritAPIWith.CURRENT_FILES,
		]);
	} catch {
		// ignore
	}
}

/**
 * Pre-fetch old + new file content for every
 * file that has comments, populating fileCache
 * so createDiffCommand makes zero API calls.
 */
async function prefetchFileDiffContent(
	_change: GerritChange,
	commentsMap: CommentMap,
	currentRevision: { _files?: Record<string, GerritFile> | null }
): Promise<void> {
	const filePaths = Array.from(commentsMap.keys()).filter(
		(p) => p !== '/PATCHSET_LEVEL'
	);

	const filesMap = currentRevision._files;
	if (!filesMap) {
		return;
	}

	await Promise.all(
		filePaths.map(async (filePath) => {
			const file = filesMap[filePath];
			if (!file) {
				return;
			}
			try {
				await FileTreeView.getFileDiffContent(file, null);
			} catch {
				// ignore pre-fetch errors
			}
		})
	);
}

async function fetchFileContents(
	change: GerritChange,
	commentsMap: CommentMap,
	gerritRepo: Repository
): Promise<Map<string, string[]>> {
	const contents = new Map<string, string[]>();
	const filePaths = Array.from(commentsMap.keys()).filter(
		(p) => p !== '/PATCHSET_LEVEL'
	);

	const revision = await change.getCurrentRevision();
	if (!revision) {
		return contents;
	}

	const filesMap = await (await revision.files(null)).getValue();

	await Promise.all(
		filePaths.map(async (filePath) => {
			try {
				const localPath = Uri.joinPath(gerritRepo.rootUri, filePath);
				const doc = await workspace.openTextDocument(localPath);
				contents.set(filePath, doc.getText().split('\n'));
				return;
			} catch {
				// not checked out, try Gerrit API
			}

			try {
				const file = filesMap?.[filePath];
				if (!file) {
					return;
				}
				const textContent = await file.getNewContent();
				if (textContent) {
					contents.set(
						filePath,
						textContent.buffer.toString('utf8').split('\n')
					);
				}
			} catch {
				// ignore fetch errors
			}
		})
	);

	return contents;
}

function extractSnippet(
	fileLines: string[] | undefined,
	line: number | undefined
): string | undefined {
	if (!fileLines || !line || line < 1) {
		return undefined;
	}
	const idx = line - 1;
	const start = Math.max(0, idx - 1);
	const end = Math.min(fileLines.length, idx + 2);
	const snippet: string[] = [];
	for (let i = start; i < end; i++) {
		const prefix = i === idx ? '\u25b6 ' : '  ';
		snippet.push(`${prefix}${i + 1} | ${fileLines[i]}`);
	}
	return snippet.join('\n');
}

/**
 * Group a flat list of comments into threads
 * using inReplyTo chains. Returns a map of
 * root comment ID -> chronologically sorted
 * comment list.
 */
function buildThreads(
	comments: (GerritComment | GerritDraftComment)[]
): Map<string, (GerritComment | GerritDraftComment)[]> {
	const byId = new Map<string, GerritComment | GerritDraftComment>();
	for (const c of comments) {
		byId.set(c.id, c);
	}

	const rootOf = (c: GerritComment | GerritDraftComment): string => {
		let cur = c;
		while (cur.inReplyTo && byId.has(cur.inReplyTo)) {
			cur = byId.get(cur.inReplyTo)!;
		}
		return cur.id;
	};

	const threads = new Map<string, (GerritComment | GerritDraftComment)[]>();
	for (const c of comments) {
		const root = rootOf(c);
		if (!threads.has(root)) {
			threads.set(root, []);
		}
		threads.get(root)!.push(c);
	}

	for (const arr of threads.values()) {
		arr.sort((a, b) => a.updated.timestamp() - b.updated.timestamp());
	}

	return threads;
}

function groupComments(
	commentsMap: CommentMap,
	fileContents: Map<string, string[]>,
	currentPatchSetNumber: number
): {
	draftGroups: FileGroup[];
	unresolvedGroups: FileGroup[];
	olderPatchsetGroups: FileGroup[];
} {
	const draftsByFile = new Map<string, OverviewComment[]>();
	const unresolvedByFile = new Map<string, OverviewComment[]>();
	const olderPatchsetByFile = new Map<string, OverviewComment[]>();

	for (const [filePath, comments] of commentsMap) {
		const lines = fileContents.get(filePath);
		const threads = buildThreads(comments);

		for (const threadComments of threads.values()) {
			// Thread resolution is determined by the
			// last comment in the reply chain.
			const last = threadComments[threadComments.length - 1];
			// If unresolved is not explicitly true, the
			// thread is considered resolved.
			const threadUnresolved = last.unresolved === true;

			for (const c of threadComments) {
				const authorInfo = c.author;
				const isOlderPatchset =
					typeof c.patchSet === 'number' &&
					c.patchSet !== currentPatchSetNumber;

				const item: OverviewComment = {
					filePath,
					line: c.line,
					message: c.message ?? '',
					authorName: authorInfo?.name ?? 'You',
					updatedStr: c.updated
						? c.updated.format({
								dateStyle: 'short',
								timeStyle: 'short',
							})
						: '',
					isDraft: c.isDraft,
					unresolved: threadUnresolved,
					codeSnippet: extractSnippet(lines, c.line),
					patchSet: c.patchSet,
				};

				if (c.isDraft) {
					if (!draftsByFile.has(filePath)) {
						draftsByFile.set(filePath, []);
					}
					draftsByFile.get(filePath)!.push(item);
				} else if (threadUnresolved && isOlderPatchset) {
					if (!olderPatchsetByFile.has(filePath)) {
						olderPatchsetByFile.set(filePath, []);
					}
					olderPatchsetByFile.get(filePath)!.push(item);
				} else if (threadUnresolved) {
					if (!unresolvedByFile.has(filePath)) {
						unresolvedByFile.set(filePath, []);
					}
					unresolvedByFile.get(filePath)!.push(item);
				}
			}
		}
	}

	const toGroups = (map: Map<string, OverviewComment[]>): FileGroup[] =>
		Array.from(map.entries()).map(([filePath, comments]) => ({
			filePath,
			comments,
		}));

	return {
		draftGroups: toGroups(draftsByFile),
		unresolvedGroups: toGroups(unresolvedByFile),
		olderPatchsetGroups: toGroups(olderPatchsetByFile),
	};
}

async function navigateToComment(
	filePath: string,
	line: number | undefined,
	patchSet: number | undefined,
	gerritRepo: Repository
): Promise<void> {
	if (filePath === '/PATCHSET_LEVEL') {
		return;
	}

	// Block navigation for comments from a
	// different patchset.
	if (
		typeof patchSet === 'number' &&
		activePatchSetNumber > 0 &&
		patchSet !== activePatchSetNumber
	) {
		void window.showInformationMessage(
			`This comment is from patchset ${patchSet}` +
				` (current: ${activePatchSetNumber}).` +
				' Navigation is only available for' +
				' current patchset comments.'
		);
		return;
	}

	try {
		const change = activeChange;
		if (!change) {
			log('navigateToComment: no cached change');
			return;
		}

		const currentRevision = await change.getCurrentRevision();
		if (!currentRevision) {
			log('navigateToComment: revision not found');
			return;
		}

		const revDesc = {
			id: currentRevision.revisionID,
			number: currentRevision.number,
		};

		const file =
			currentRevision._files?.[filePath] ??
			new GerritFile(change.changeID, change.project, revDesc, filePath, {
				lines_inserted: 0,
				lines_deleted: 0,
				size_delta: 0,
				size: 0,
				old_path: undefined,
			});

		const diffCmd = await FileTreeView.createDiffCommand(
			gerritRepo,
			file,
			null
		);
		if (!diffCmd?.arguments) {
			log('navigateToComment: diff command' + ' failed for ' + filePath);
			return;
		}

		const [leftUri, rightUri] = diffCmd.arguments as [Uri, Uri];

		await vscodeCommands.executeCommand(
			diffCmd.command,
			...(diffCmd.arguments as unknown[])
		);

		// Immediately navigate to the line so the
		// user sees the right location while
		// comments load in the background.
		if (line) {
			await vscodeCommands.executeCommand(
				'workbench.action.focusActiveEditorGroup'
			);
			await vscodeCommands.executeCommand('revealLine', {
				lineNumber: line - 1,
				at: 'center',
			});
		}

		// Poll until provideCommentingRanges has
		// fired and a DocumentCommentManager exists
		// for one of the diff URIs. Use short ticks
		// since data is cached - the manager should
		// appear quickly.
		const findMgr = ():
			| import('../../providers/commentProvider').DocumentCommentManager
			| null =>
			CommentManager.getFileManagerForUri(rightUri) ??
			CommentManager.getFileManagerForUri(leftUri);

		let loadedMgr = findMgr();
		if (!loadedMgr) {
			for (let i = 0; i < 30; i++) {
				await new Promise((r) => setTimeout(r, 50));
				loadedMgr = findMgr();
				if (loadedMgr) {
					break;
				}
			}
		}

		if (loadedMgr) {
			await loadedMgr.loadComments();
		}

		if (line) {
			const expandAtLine = (
				mgr:
					| import('../../providers/commentProvider').DocumentCommentManager
					| null
			): void => {
				if (!mgr) {
					return;
				}
				for (const t of mgr.createdThreads) {
					if (t.range.start.line === line - 1) {
						t.collapsibleState =
							CommentThreadCollapsibleState.Expanded;
					}
				}
			};

			expandAtLine(CommentManager.getFileManagerForUri(rightUri));
			expandAtLine(CommentManager.getFileManagerForUri(leftUri));

			const managers = CommentManager.getFileManagersForChangeID(
				change.changeID
			);
			for (const m of managers) {
				expandAtLine(m);
			}
		}
	} catch (e) {
		log('Failed to navigate to comment: ' + String(e));
	}
}
