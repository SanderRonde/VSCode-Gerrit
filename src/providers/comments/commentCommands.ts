import {
	PatchSetLevelCommentsTreeView,
	PATCHSET_LEVEL_KEY,
} from '../../views/activityBar/changes/changeTreeView/patchSetLevelCommentsTreeView';
import {
	commands,
	Position,
	Range,
	Selection,
	Uri,
	window,
	workspace,
} from 'vscode';
import { FileTreeView } from '../../views/activityBar/changes/changeTreeView/fileTreeView';
import { GerritCommentBase } from '../../lib/gerrit/gerritAPI/gerritComment';
import { CommentManager, DocumentCommentManager } from '../commentProvider';
import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { avg, diff, uniqueComplex } from '../../lib/util/util';
import { Repository } from '../../types/vscode-extension-git';
import { FileMeta, FileMetaCreate } from '../fileProvider';
import { getCurrentChangeID } from '../../lib/git/commit';
import { CacheContainer } from '../../lib/util/cache';
import * as gitDiffParser from 'gitdiff-parser';

function getCurrentMeta(): FileMeta | null {
	// First check currently open editor's URI
	const openEditor = window.activeTextEditor?.document.uri;
	const meta = openEditor ? FileMeta.tryFrom(openEditor) : null;
	return meta;
}

type ThreadMap = CacheContainer<
	string,
	{
		range: Range | null;
		comments: GerritCommentBase[];
	}[]
>;

type ThreadMapWithRanges = CacheContainer<
	string,
	{
		range: Range;
		comments: GerritCommentBase[];
	}[]
>;

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

async function getAllComments(changeID: string): Promise<{
	allThreads: ThreadMap;
	unresolvedThreads: ThreadMap;
}> {
	const { allThreads, resolvedThreadMap: unresolvedThreadMap } =
		await (async () => {
			const allComments = await (
				await GerritChange.getAllComments(changeID)
			).getValue();

			const baseEntries = [...allComments.entries()].map(
				([filePath, comments]) => {
					const threads = DocumentCommentManager.getThreadRanges(
						DocumentCommentManager.buildThreadsFromComments(
							comments
						)
					);
					return [
						filePath,
						uniqueComplex(
							threads.filter((t) => t.comments.length !== 0),
							(t) => (t.range ? t.range.start.line : {})
						),
					] as const;
				}
			);
			const resolvedThreadMap = CacheContainer.from(
				baseEntries
					.map(([key, threads]) => {
						return [
							key,
							threads.filter(
								(t) =>
									t.comments[t.comments.length - 1]
										.unresolved ?? false
							),
						] as const;
					})
					.filter(([, threads]) => threads.length !== 0)
			);
			const threadMap = CacheContainer.from(baseEntries);
			return {
				allThreads: threadMap,
				resolvedThreadMap,
			};
		})();

	return {
		unresolvedThreads: unresolvedThreadMap,
		allThreads: allThreads,
	};
}

function getCurrentComment(
	meta: FileMeta | null,
	allComments: ThreadMapWithRanges
): {
	range: Range;
	extendedRange: Range;
	comments: GerritCommentBase[];
} | null {
	// If no meta, we have to apply the diff to find comment indices. So we find
	// the comment manager (if any)
	const manager = CommentManager.getFileManagerForUri(
		window.activeTextEditor!.document.uri
	);

	// First find the correct comments
	const comments = buildExpandedThreadRanges(
		allComments
			.get(
				meta?.filePath ??
					manager?.filePath ??
					window.activeTextEditor!.document.uri.path
			)!
			.map((c) =>
				!manager?.diffData?.diff
					? c
					: {
							range: DocumentCommentManager.applyDiffToCommentRange(
								c.range,
								manager?.diffData.diff
							),
							comments: c.comments,
					  }
			)
	).filter((c) => !!c.extendedRange && !!c.range) as {
		extendedRange: Range;
		range: Range;
		comments: GerritCommentBase[];
	}[];

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

function getClosestNumWithMaxDistance(
	numbers: number[],
	num: number,
	maxDistance: number
): number {
	const sortedNumbers = numbers.sort((a, b) => a - b);
	if (sortedNumbers.length === 0) {
		return 0;
	}
	if (num < sortedNumbers[0]) {
		return sortedNumbers[0];
	}
	for (let i = 0; i < sortedNumbers.length; i++) {
		if (num > sortedNumbers[i]) {
			if (i === sortedNumbers.length - 1) {
				return sortedNumbers[i];
			}
			if (
				num > avg(sortedNumbers[i], sortedNumbers[i + 1]) &&
				sortedNumbers[i + 1] - num <= maxDistance
			) {
				return sortedNumbers[i + 1];
			} else {
				return sortedNumbers[i];
			}
		}
	}
	return sortedNumbers[sortedNumbers.length - 1];
}

async function getCurrentCommentData(gerritRepo: Repository): Promise<{
	comment: {
		range: Range | null;
		comments: GerritCommentBase[];
	} | null;
	allThreads: ThreadMap;
	unresolvedThreads: ThreadMap;
	currentMeta: FileMeta | null;
	changeID: string;
	filePath: string | undefined;
} | null> {
	const meta = getCurrentMeta();
	const changeID = meta?.changeID ?? (await getCurrentChangeID(gerritRepo));
	if (!changeID) {
		void window.showInformationMessage(
			'Failed to find currently active change'
		);
		return null;
	}

	const { unresolvedThreads, allThreads } = await getAllComments(changeID);

	// If we have meta info, we want to start at the current position
	const currentComment =
		window.activeTextEditor &&
		(() => {
			if (meta && !unresolvedThreads.has(meta.filePath)) {
				return null;
			}
			if (
				!meta &&
				!unresolvedThreads.has(
					workspace.asRelativePath(
						window.activeTextEditor.document.uri
					)
				)
			) {
				return null;
			}
			if (meta && meta.filePath === PATCHSET_LEVEL_KEY) {
				// Comment is equal to index in file
				const comments = allThreads.get(meta.filePath)!;
				const line = window.activeTextEditor.selection.active.line;

				const unresolvedComments = unresolvedThreads.get(
					meta.filePath
				)!;
				if (unresolvedComments.includes(comments[line])) {
					return comments[line];
				}
				return comments[
					getClosestNumWithMaxDistance(
						unresolvedComments.map((c) => comments.indexOf(c)),
						line,
						3
					)
				];
			}
			return getCurrentComment(
				meta,
				unresolvedThreads as ThreadMapWithRanges
			);
		})();
	return {
		unresolvedThreads,
		allThreads,
		comment: currentComment ?? null,
		currentMeta: meta,
		changeID,
		filePath:
			window.activeTextEditor &&
			(meta?.filePath ??
				workspace.asRelativePath(window.activeTextEditor.document.uri)),
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
	gerritRepo: Repository,
	resolveIndices: (
		data: Exclude<Awaited<ReturnType<typeof getCurrentCommentData>>, null>
	) => {
		filePath: string;
		commentIndex: COMMENT_POSITION | number;
	}
): Promise<void> {
	const data = await getCurrentCommentData(gerritRepo);
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

		const change = await GerritChange.getChangeOnce(data.changeID);
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
			context: [],
		};
	})();
	if (!partialFileMeta) {
		return;
	}

	if (data.unresolvedThreads.size === 0) {
		// Possible if no comments are left
		void window.showInformationMessage(
			`Found no more unresolved comments in change ${data.changeID}`
		);
		return;
	}

	const { filePath, commentIndex } = resolveIndices(data);

	if (!data.currentMeta || filePath !== data.currentMeta.filePath) {
		if (filePath === PATCHSET_LEVEL_KEY) {
			const cmd = PatchSetLevelCommentsTreeView.createCommand(
				{
					id: partialFileMeta.changeID,
					project: partialFileMeta.project,
				},
				partialFileMeta.commit,
				data.allThreads.get(PATCHSET_LEVEL_KEY)!.map((t) => t.comments)
			);
			await commands.executeCommand(
				cmd.command,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				...(cmd.arguments ?? [])
			);
		} else if (
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
					const change = await GerritChange.getChangeOnce(
						data.currentMeta!.changeID
					);
					return change?.getCurrentRevision();
				}
				const change = await GerritChange.getChangeOnce(
					diffEditor.changeID
				);
				if (!change) {
					return null;
				}
				const revisions = await change.revisions();
				return revisions?.[diffEditor.file.currentRevision.id];
			})();
			const files = await (await lastRevision?.files(
				diffEditor?.baseRevision ?? null
			))!.getValue();
			const file = files[filePath];
			if (!file) {
				void window.showInformationMessage('Failed to find file');
				return;
			}

			const cmd = await FileTreeView.createDiffCommand(
				gerritRepo,
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
			await commands.executeCommand(
				'vscode.open',
				Uri.joinPath(gerritRepo.rootUri, filePath)
			);
		}
	}

	// Now get new active editor
	const newEditor = window.activeTextEditor!;

	const fileComments = data.unresolvedThreads.get(filePath) ?? [];
	const index =
		typeof commentIndex === 'number'
			? commentIndex
			: commentIndex === COMMENT_POSITION.START
			? 0
			: fileComments.length - 1;
	const comment = fileComments[index]!;

	const manager = CommentManager.getFileManagerForUri(
		window.activeTextEditor!.document.uri
	);
	// If there is a meta, that means that this is a diff view. In that case we
	// don't need to apply any modifications since it's readonly.
	const commentDiff = data.currentMeta
		? null
		: manager
		? manager.diffData?.diff
		: await (async () => {
				const file = await CommentManager.getFileFromOpenDocument(
					gerritRepo,
					window.activeTextEditor!.document
				);
				if (!file) {
					return null;
				}
				const hashes = await CommentManager.getFileHashObjects(
					gerritRepo,
					file,
					window.activeTextEditor!.document
				);
				if (!hashes) {
					return null;
				}

				const parser =
					gitDiffParser as unknown as typeof import('gitdiff-parser').default;
				const diff = await gerritRepo.diffBlobs(
					hashes.newHash,
					hashes.modifiedHash
				);
				return parser.parse(diff)[0];
		  })();

	const pos = (() => {
		if (filePath === PATCHSET_LEVEL_KEY) {
			return new Position(
				data.allThreads.get(filePath)!.indexOf(comment),
				0
			);
		}
		if (!comment.range) {
			return new Position(0, 0);
		}
		if (commentDiff) {
			return DocumentCommentManager.applyDiffToCommentRange(
				comment.range,
				commentDiff
			).start;
		}
		return comment.range.start;
	})();
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

export async function nextUnresolvedComment(
	gerritRepo: Repository
): Promise<void> {
	await jumpToUnresolvedCommentShared(gerritRepo, (data) => {
		const allFilePaths = supersortFilePaths(data.unresolvedThreads.keys());

		// If no file path, return first comment of first file
		if (!data.filePath) {
			return {
				filePath: allFilePaths[0],
				commentIndex: COMMENT_POSITION.START,
			};
		}

		// If no comment in current file, get first comment
		if (!data.comment) {
			return {
				filePath: data.filePath,
				commentIndex: COMMENT_POSITION.START,
			};
		}

		// Find comment index in current file
		const currentFileComments = data.unresolvedThreads.get(data.filePath);

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
				filePath: data.filePath,
				commentIndex: commentIndex + 1,
			};
		}

		// Find file index in all files
		const fileIndex = allFilePaths.indexOf(data.filePath);
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

export async function previousUnresolvedComment(
	gerritRepo: Repository
): Promise<void> {
	await jumpToUnresolvedCommentShared(gerritRepo, (data) => {
		const allFilePaths = supersortFilePaths([
			...data.unresolvedThreads.keys(),
		]);

		// If no file path, return first comment of last file
		if (!data.filePath) {
			return {
				filePath: allFilePaths[allFilePaths.length - 1],
				commentIndex: COMMENT_POSITION.END,
			};
		}

		// If no comment in current file, get first comment
		if (!data.comment) {
			return {
				filePath: data.filePath,
				commentIndex: COMMENT_POSITION.END,
			};
		}

		// Find comment index in current file
		const currentFileComments = data.unresolvedThreads.get(data.filePath);

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
				filePath: data.filePath,
				commentIndex: commentIndex - 1,
			};
		}

		// Find file index in all files
		const fileIndex = allFilePaths.indexOf(data.filePath);
		if (fileIndex === -1) {
			return {
				filePath: allFilePaths[0],
				commentIndex: COMMENT_POSITION.END,
			};
		}

		const nextFile =
			allFilePaths.length === 1
				? allFilePaths[0]
				: allFilePaths[fileIndex - 1] ??
				  allFilePaths[allFilePaths.length - 1];
		return {
			filePath: nextFile,
			commentIndex: COMMENT_POSITION.END,
		};
	});
}
