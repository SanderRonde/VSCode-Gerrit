import {
	PatchSetLevelCommentsTreeView,
	PATCHSET_LEVEL_KEY,
} from '../../views/activityBar/changes/changeTreeView/patchSetLevelCommentsTreeView';
import { FileTreeView } from '../../views/activityBar/changes/changeTreeView/fileTreeView';
import {
	FileMeta,
	FileMetaCreate,
	FileMetaWithSideAndBase,
} from '../fileProvider';
import { GerritCommentBase } from '../../lib/gerrit/gerritAPI/gerritComment';
import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { commands, Position, Range, Selection, window } from 'vscode';
import { TextContent } from '../../lib/gerrit/gerritAPI/gerritFile';
import { DocumentCommentManager } from '../commentProvider';
import { getCurrentChangeID } from '../../lib/git/commit';
import { uniqueComplex } from '../../lib/util/util';

function getCurrentMeta(): FileMeta | null {
	// First check currently open editor's URI
	const openEditor = window.activeTextEditor?.document.uri;
	const meta = openEditor ? FileMeta.tryFrom(openEditor) : null;
	return meta;
}

type ThreadMap = Map<
	string,
	{
		range: Range | null;
		extendedRange: Range | null;
		comments: GerritCommentBase[];
	}[]
>;

type ThreadMapWithRanges = Map<
	string,
	{
		range: Range;
		extendedRange: Range;
		comments: GerritCommentBase[];
	}[]
>;

const allCommentsCache: Map<
	string,
	{
		comments: {
			allThreads: ThreadMap;
			resolvedThreadMap: ThreadMap;
		};
		timer: NodeJS.Timeout;
	}
> = new Map();

function avg(...values: number[]): number {
	return values.reduce((a, b) => a + b, 0) / values.length;
}

function diff(a: number, b: number): number {
	return Math.abs(a - b);
}

function iterateUntilTrue<T>(
	arr: T[],
	index: number,
	iterator: (index: number) => number,
	condition: (item: T) => boolean
): T | null {
	while (!condition(arr[index]) && arr[index]) {
		index = iterator(index);
	}
	return arr[index] ?? null;
}

const EXTRA_RANGE = 5;
function buildExpandedThreadRanges(
	threads: {
		range: Range | null;
		comments: GerritCommentBase[];
	}[]
): {
	extendedRange: Range | null;
	range: Range | null;
	comments: GerritCommentBase[];
}[] {
	const expandedThreads: {
		extendedRange: Range | null;
		range: Range | null;
		comments: GerritCommentBase[];
	}[] = [];
	for (let i = 0; i < threads.length; i++) {
		const lastThread =
			iterateUntilTrue(
				threads,
				i - 1,
				(i) => i - 1,
				(t) => !!t && !!t.range
			) ?? null;
		const thread = threads[i];
		const nextThread =
			iterateUntilTrue(
				threads,
				i + 1,
				(i) => i + 1,
				(t) => !!t && !!t.range
			) ?? null;

		if (!thread.range) {
			expandedThreads.push({
				comments: thread.comments,
				range: thread.range,
				extendedRange: thread.range,
			});
			continue;
		}

		// If there is a previous thread, take the average between the two
		// then make sure it's no further back than EXTRA_RANGE from the
		// current start position. If no previous thread, just go back
		// EXTRA_RANGE. Then check that the result is not negative.
		const startLine = Math.max(
			lastThread?.range &&
				diff(lastThread.range.end.line, thread.range.start.line) > 1
				? Math.max(
						Math.round(
							avg(
								lastThread.range.end.line,
								thread.range.start.line
							)
						),
						thread.range.start.line - EXTRA_RANGE
				  )
				: thread.range.start.line - EXTRA_RANGE,
			0
		);
		// If there is a previous thread, get avg between the two
		// then make sure it's no further forward than EXTRA_RANGE from
		// the current start position. If no previous thread, just go
		// forward EXTRA_RANGE.
		const endLine =
			nextThread?.range &&
			diff(nextThread.range.start.line, thread.range.end.line) > 1
				? Math.max(
						Math.round(
							avg(
								nextThread.range.start.line,
								thread.range.end.line
							)
						),
						thread.range.end.line + EXTRA_RANGE
				  )
				: thread.range.end.line + EXTRA_RANGE;
		expandedThreads.push({
			comments: thread.comments,
			range: thread.range,
			extendedRange: new Range(
				new Position(startLine, thread.range.start.character),
				new Position(endLine, thread.range.end.character)
			),
		});
	}
	return expandedThreads;
}

const COMMENT_RETAIN_TIME = 1000 * 60 * 10;
async function getAllComments(changeID: string): Promise<{
	allThreads: ThreadMap;
	resolvedThreads: ThreadMap;
}> {
	const { allThreads, resolvedThreadMap } = await (async () => {
		if (allCommentsCache.has(changeID)) {
			return allCommentsCache.get(changeID)!.comments;
		}
		const allComments = await GerritChange.getAllCommentsCached(changeID);
		const resolvedThreadMap = new Map(
			[...allComments.entries()].map(([filePath, comments]) => {
				const threads = buildExpandedThreadRanges(
					DocumentCommentManager.getThreadRanges(
						DocumentCommentManager.buildThreadsFromComments(
							comments
						)
					)
				);
				return [
					filePath,
					uniqueComplex(
						threads
							.filter((t) => t.comments.length !== 0)
							.filter(
								(t) =>
									t.comments[t.comments.length - 1]
										.unresolved ?? false
							),
						(t) => t.range?.start.line ?? -1
					),
				];
			})
		);
		const threadMap = new Map(
			[...allComments.entries()].map(([filePath, comments]) => {
				const threads = buildExpandedThreadRanges(
					DocumentCommentManager.getThreadRanges(
						DocumentCommentManager.buildThreadsFromComments(
							comments
						)
					)
				);
				return [
					filePath,
					uniqueComplex(
						threads.filter((t) => t.comments.length !== 0),
						(t) => t.range?.start.line ?? -1
					),
				];
			})
		);
		return {
			allThreads: threadMap,
			resolvedThreadMap,
		};
	})();
	const timer = allCommentsCache.get(changeID)?.timer ?? null;

	// Extend timer
	if (timer) {
		clearTimeout(timer);
	}
	allCommentsCache.set(changeID, {
		comments: {
			resolvedThreadMap: resolvedThreadMap,
			allThreads: allThreads,
		},
		timer: setTimeout(() => {
			allCommentsCache.delete(changeID);
		}, COMMENT_RETAIN_TIME),
	});
	return {
		resolvedThreads: resolvedThreadMap,
		allThreads: allThreads,
	};
}

function getCurrentComment(
	meta: FileMeta,
	allComments: ThreadMapWithRanges
): {
	range: Range;
	extendedRange: Range;
	comments: GerritCommentBase[];
} | null {
	// First find the correct comments
	const comments = allComments.get(meta.filePath)!;

	// Find cursor position within those comments
	const cursorPosition = window.activeTextEditor!.selection.active;

	const sortedComments = comments.sort((a, b) => {
		return (a.range?.start.line ?? -1) - (b.range?.start.line ?? -1);
	});

	if (cursorPosition.isBeforeOrEqual(sortedComments[0].extendedRange.start)) {
		return null;
	}

	// First check if we're exactly on some comment
	for (const comment of sortedComments) {
		if (cursorPosition.line === comment.range.start.line) {
			return comment;
		}
	}

	// Second iteration check if we're in any comment's extended range
	for (const comment of sortedComments) {
		if (
			cursorPosition.isAfterOrEqual(comment.extendedRange.start) &&
			cursorPosition.isBeforeOrEqual(comment.extendedRange.end)
		) {
			return comment;
		}
	}

	// Now just check if it's anywhere after some comment
	for (let i = 0; i < sortedComments.length; i++) {
		const comment = sortedComments[i];
		if (
			cursorPosition.isAfterOrEqual(comment.range.start) &&
			(!sortedComments[i + 1] ||
				!cursorPosition.isBeforeOrEqual(
					sortedComments[i + 1].range.end
				))
		) {
			return comment;
		}
	}

	// Shouldn't be possible to get here but well
	return sortedComments[sortedComments.length - 1];
}

async function getCurrentCommentData(): Promise<{
	comment: {
		range: Range | null;
		extendedRange: Range | null;
		comments: GerritCommentBase[];
	} | null;
	allThreads: ThreadMap;
	resolvedThreads: ThreadMap;
	currentMeta: FileMeta | null;
	changeID: string;
} | null> {
	const meta = getCurrentMeta();
	const changeID = meta?.changeID ?? (await getCurrentChangeID());
	if (!changeID) {
		void window.showInformationMessage(
			'Failed to find currently active change'
		);
		return null;
	}

	const { resolvedThreads, allThreads } = await getAllComments(changeID);

	// If we have meta info, we want to start at the current position
	const currentComment = (() => {
		if (!meta || !resolvedThreads.has(meta.filePath)) {
			return null;
		}
		if (meta.filePath === PATCHSET_LEVEL_KEY) {
			// Comment is equal to index in file
			const comments = allThreads.get(meta.filePath)!;
			const line = window.activeTextEditor!.selection.active.line - 1;
			if (line > comments.length) {
				return comments[comments.length - 1];
			}
			return comments[line];
		}
		return getCurrentComment(meta, resolvedThreads as ThreadMapWithRanges);
	})();
	return {
		resolvedThreads,
		allThreads,
		comment: currentComment,
		currentMeta: meta,
		changeID,
	};
}

function getStrNum(str: string, maxLength: number): number {
	return str.split('/').reduce((prev, current, i) => {
		return (
			prev +
			Math.pow(256, maxLength - i) * Math.min(current.charCodeAt(0), 256)
		);
	}, 0);
}

/**
 * Sorts filepaths by their folder first, then by file using some
 * fancy algorithm with numbers and stuff.
 */
function supersortFilePaths(filePaths: string[]): string[] {
	const maxLength = Math.max(...filePaths.map((s) => s.split('/').length));

	return filePaths.sort(
		(a, b) => getStrNum(a, maxLength) - getStrNum(b, maxLength)
	);
}

async function jumpToUnresolvedCommentShared(
	resolveIndices: (
		data: Exclude<Awaited<ReturnType<typeof getCurrentCommentData>>, null>
	) => {
		filePath: string;
		commentIndex: COMMENT_POSITION | number;
	}
): Promise<void> {
	const data = await getCurrentCommentData();
	if (!data) {
		return;
	}

	// Craft all-meta-but-filePath
	const partialFileMeta = await (async (): Promise<Omit<
		FileMetaCreate,
		'filePath'
	> | null> => {
		if (data.currentMeta) {
			return data.currentMeta;
		}

		const change = await GerritChange.getChangeCached(data.changeID);
		if (!change) {
			void window.showInformationMessage('Failed to get current change');
			return null;
		}
		const revision = await change.currentRevision();
		if (!revision) {
			void window.showInformationMessage('Failed to get current change');
			return null;
		}

		return {
			project: change.project,
			changeID: change.changeID,
			commit: revision,
		};
	})();
	if (!partialFileMeta) {
		return;
	}

	if (data.resolvedThreads.size === 0) {
		// Possible if no comments are left
		void window.showInformationMessage('Found no more unresolved comments');
		return;
	}

	const { filePath, commentIndex } = resolveIndices(data);

	if (!data.currentMeta || filePath !== data.currentMeta.filePath) {
		if (filePath === PATCHSET_LEVEL_KEY) {
			debugger;
			const cmd = PatchSetLevelCommentsTreeView.createCommand(
				{
					id: partialFileMeta.changeID,
					project: partialFileMeta.project,
				},
				partialFileMeta.commit,
				data.resolvedThreads
					.get(PATCHSET_LEVEL_KEY)!
					.map((t) => t.comments)
			);
			await commands.executeCommand(
				cmd.command,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				...(cmd.arguments ?? [])
			);
		}

		if (
			window.activeTextEditor &&
			(FileTreeView.getDiffEditor(window.activeTextEditor.document.uri) ||
				(data.currentMeta &&
					data.currentMeta.filePath === PATCHSET_LEVEL_KEY))
		) {
			// Open in new diff editor
			const diffEditor = FileTreeView.getDiffEditor(
				window.activeTextEditor.document.uri
			);
			const lastRevision = await (async () => {
				if (!diffEditor) {
					const change = await GerritChange.getChangeCached(
						data.currentMeta!.changeID
					);
					return change?.getCurrentRevision();
				}
				const revisions = await diffEditor.change.revisions();
				return revisions?.[diffEditor.file.currentRevision.id];
			})();
			const files = (await lastRevision?.files(
				diffEditor?.baseRevision ?? null
			))!;
			const file = files[filePath];
			if (!file) {
				void window.showInformationMessage('Failed to find file');
				return;
			}

			const cmd = await FileTreeView.createDiffCommand(
				file,
				diffEditor?.baseRevision ?? null
			);
			if (!cmd) {
				void window.showInformationMessage('Failed to craft command');
				return;
			}

			await commands.executeCommand(
				cmd.command,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				...(cmd.arguments ?? [])
			);
		} else {
			// Open in single-file editor
			const content = TextContent.from(
				FileMeta.createFileMeta({
					...partialFileMeta,
					filePath,
				}),
				'',
				'utf8'
			);
			const metaWithData =
				(window.activeTextEditor &&
					FileMetaWithSideAndBase.tryFrom(
						window.activeTextEditor.document.uri
					)) ??
				null;
			await commands.executeCommand(
				'vscode.open',
				content.toVirtualFile(
					'BOTH',
					metaWithData?.baseRevision ?? null
				)
			);
		}
	}

	// Now get new active editor
	const newEditor = window.activeTextEditor!;

	const fileComments = data.resolvedThreads.get(filePath)!;
	const index =
		typeof commentIndex === 'number'
			? commentIndex
			: commentIndex === COMMENT_POSITION.START
			? 0
			: fileComments.length - 1;
	const comment = fileComments[index]!;
	const pos =
		filePath === PATCHSET_LEVEL_KEY
			? new Position(index + 1, 0)
			: new Position(
					comment.range?.start.line ?? 0,
					comment.range?.start.character ?? 0
			  );
	newEditor.selection = new Selection(pos, pos);

	await commands.executeCommand('revealLine', {
		lineNumber: pos.line,
		at: 'center',
	});
}

enum COMMENT_POSITION {
	START = 'start',
	END = 'end',
}

export async function nextUnresolvedComment(): Promise<void> {
	await jumpToUnresolvedCommentShared((data) => {
		const allFilePaths = supersortFilePaths([
			...data.resolvedThreads.keys(),
		]);

		// If no meta, return first comment of first file
		if (!data.currentMeta) {
			return {
				filePath: allFilePaths[0],
				commentIndex: COMMENT_POSITION.START,
			};
		}

		// If no comment in current file, get first comment
		if (!data.comment) {
			return {
				filePath: data.currentMeta.filePath,
				commentIndex: COMMENT_POSITION.START,
			};
		}

		// Find comment index in current file
		const currentFileComments = data.resolvedThreads.get(
			data.currentMeta.filePath
		);

		if (!currentFileComments) {
			return {
				filePath: allFilePaths[0],
				commentIndex: COMMENT_POSITION.START,
			};
		}

		const commentIndex = currentFileComments.findIndex((c) => {
			return c.comments[0].id === data.comment!.comments[0].id;
		});

		// If not the last, return this + 1
		if (commentIndex !== currentFileComments.length - 1) {
			return {
				filePath: data.currentMeta.filePath,
				commentIndex: commentIndex + 1,
			};
		}

		// Find file index in all files
		const fileIndex = allFilePaths.indexOf(data.currentMeta.filePath);
		if (fileIndex === -1) {
			return {
				filePath: allFilePaths[0],
				commentIndex: COMMENT_POSITION.START,
			};
		}

		const nextFile =
			allFilePaths.length === 1
				? allFilePaths[0]
				: allFilePaths[fileIndex + 1] ?? allFilePaths[0];
		return {
			filePath: nextFile,
			commentIndex: COMMENT_POSITION.START,
		};
	});
}

export async function previousUnresolvedComment(): Promise<void> {
	await jumpToUnresolvedCommentShared((data) => {
		const allFilePaths = supersortFilePaths([
			...data.resolvedThreads.keys(),
		]);

		// If no meta, return first comment of first file
		if (!data.currentMeta) {
			return {
				filePath: allFilePaths[0],
				commentIndex: COMMENT_POSITION.END,
			};
		}

		// If no comment in current file, get first comment
		if (!data.comment) {
			return {
				filePath: data.currentMeta.filePath,
				commentIndex: COMMENT_POSITION.END,
			};
		}

		// Find comment index in current file
		const currentFileComments = data.resolvedThreads.get(
			data.currentMeta.filePath
		);

		if (!currentFileComments) {
			return {
				filePath: allFilePaths[0],
				commentIndex: COMMENT_POSITION.END,
			};
		}

		const commentIndex = currentFileComments.findIndex((c) => {
			return c.comments[0].id === data.comment!.comments[0].id;
		});

		// If not the first, return this - 1
		if (commentIndex !== 0) {
			return {
				filePath: data.currentMeta.filePath,
				commentIndex: commentIndex - 1,
			};
		}

		// Find file index in all files
		const fileIndex = allFilePaths.indexOf(data.currentMeta.filePath);
		if (fileIndex === -1) {
			return {
				filePath: allFilePaths[0],
				commentIndex: COMMENT_POSITION.END,
			};
		}

		const nextFile =
			allFilePaths.length === 1
				? allFilePaths[0]
				: allFilePaths[fileIndex + 1] ?? allFilePaths[0];
		return {
			filePath: nextFile,
			commentIndex: COMMENT_POSITION.END,
		};
	});
}
