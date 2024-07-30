import {
	CommentController,
	CommentMode,
	comments,
	CommentThread,
	CommentThreadCollapsibleState,
	Disposable,
	env,
	Position,
	Range,
	TextDocument,
	Uri,
	window,
	workspace,
} from 'vscode';
import {
	GerritComment,
	GerritCommentBase,
	GerritDraftComment,
} from '../lib/gerrit/gerritAPI/gerritComment';
import { PATCHSET_LEVEL_KEY } from '../views/activityBar/changes/changeTreeView/patchSetLevelCommentsTreeView';
import {
	GerritChangeStatus,
	GerritCommentSide,
} from '../lib/gerrit/gerritAPI/types';
import { FileTreeView } from '../views/activityBar/changes/changeTreeView/fileTreeView';
import { GerritCommentThread } from '../lib/gerrit/gerritAPI/gerritCommentThread';
import { FileMetaWithSideAndBase, FileProvider } from './fileProvider';
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { DateSortDirection, DateTime } from '../lib/util/dateTime';
import { GerritFile } from '../lib/gerrit/gerritAPI/gerritFile';
import { getCurrentChangeIDCached } from '../lib/git/commit';
import { GerritAPIWith } from '../lib/gerrit/gerritAPI/api';
import { getAPIForRepo } from '../lib/gerrit/gerritAPI';
import { CacheContainer } from '../lib/util/cache';
import { uniqueComplex } from '../lib/util/util';
import * as gitDiffParser from 'gitdiff-parser';
import path = require('path');
import {
	GerritRepo,
	getCurrentGerritRepoForUri,
	getRepoFromUri,
} from '../lib/gerrit/gerritRepo';
import { PatchsetDescription } from '../views/activityBar/changes/changeTreeView';
import { CommentDecorationProvider } from './commentDecorationProvider';
import { Data } from '../lib/util/data';

export interface GerritCommentReply {
	text: string;
	thread: GerritCommentThread;
}

export interface NewlyCreatedGerritCommentReply {
	text: string;
	thread: CommentThread & Partial<GerritCommentThreadProps>;
}

interface GerritCommentThreadProps {
	resolved: boolean;
	comments: GerritCommentBase[];
}

export class DocumentCommentManager {
	private _threadMap: CacheContainer<string, GerritCommentThread> =
		new CacheContainer();
	private _createdThreads = new Set<CommentThread>();
	private _threadLineCount: Map<number, number> = new Map();
	private _commentLoader: Promise<void> | null = null;
	public diffData?: {
		diff: gitDiffParser.File;
		file: GerritFile;
		oldDiffParsed: gitDiffParser.File;
		newHash: string;
	};

	public constructor(
		private readonly _gerritReposD: Data<GerritRepo[]>,
		public readonly document: Uri,
		private readonly _commentController: CommentController,
		public readonly filePath: string,
		public readonly metadata: {
			changeID: string;
			revision: PatchsetDescription;
		}
	) {}

	public static applyDiffToCommentRange(
		range: Range,
		diff: gitDiffParser.File
	): Range {
		return new Range(
			new Position(
				CommentManager.mapOldPositionToNew(diff, range.start.line),
				range.start.character
			),
			new Position(
				CommentManager.mapOldPositionToNew(diff, range.end.line),
				range.end.character
			)
		);
	}

	public static getCommentRange(
		comment: Readonly<GerritCommentBase>
	): Range | null {
		if (comment.range) {
			return GerritComment.gerritRangeToVSCodeRange(comment.range);
		}
		if (comment.line) {
			return new Range(
				new Position(comment.line - 1, 0),
				new Position(comment.line - 1, 0)
			);
		}
		return null;
	}

	public static getAllRepliesTo(
		comment: GerritCommentBase,
		allComments: GerritCommentBase[]
	): GerritCommentBase[] {
		const replies: GerritCommentBase[] = [comment];
		const directReplies = allComments.filter(
			(c) => c.inReplyTo === comment.id
		);
		replies.push(...directReplies);
		for (const reply of directReplies) {
			replies.push(...this.getAllRepliesTo(reply, allComments));
		}
		return uniqueComplex(replies, (c) => c.id);
	}

	public static buildThreadsFromComments(
		comments: GerritCommentBase[]
	): GerritCommentBase[][] {
		return comments
			.filter((c) => !c.inReplyTo)
			.map((c) => this.getAllRepliesTo(c, comments))
			.map((t) =>
				DateTime.sortByDate(
					t,
					DateSortDirection.INCREASING_TIME,
					(c) => c.updated
				)
			);
	}

	public static getThreadRanges(threads: GerritCommentBase[][]): {
		range: Range | null;
		comments: GerritCommentBase[];
	}[] {
		return threads.map((thread) => {
			return {
				range: DocumentCommentManager.getCommentRange(thread[0]),
				comments: thread,
			};
		});
	}

	public async refreshComments(): Promise<void> {
		this.dispose();
		await this.loadComments(true);
	}

	public async loadComments(forceUpdate: boolean = false): Promise<this> {
		// This can be called a bunch of times, we batch the same calls
		if (this._commentLoader) {
			await this._commentLoader;
			return this;
		}

		const loaderPromise = (async () => {
			const fileMeta = FileMetaWithSideAndBase.tryFrom(this.document);
			if (fileMeta?.isEmpty()) {
				return;
			}

			const isPatchSetLevel =
				fileMeta && fileMeta.filePath === PATCHSET_LEVEL_KEY;
			const currentChangeID = await getCurrentChangeIDCached();
			const changeID =
				fileMeta?.toChangeIDWithRepo(this._gerritReposD.get()) ||
				currentChangeID;
			if (!changeID) {
				return;
			}
			const commentSubscription = await GerritChange.getAllComments(
				this._gerritReposD,
				changeID,
				{
					allowFail: changeID === currentChangeID,
				}
			);
			const comments =
				(await commentSubscription.getValue(forceUpdate)).get(
					this.filePath
				) ?? [];
			commentSubscription.subscribe(
				new WeakRef(() => this.refreshComments())
			);
			(
				await GerritChange.getChange(this._gerritReposD, changeID)
			).subscribe(new WeakRef(() => this.refreshComments()));

			this.dispose();
			const thisSideComments =
				isPatchSetLevel || !fileMeta
					? comments
					: comments.filter(
							(c) =>
								c.side ??
								GerritCommentSide.RIGHT === fileMeta.side
						);
			let threads = DocumentCommentManager.getThreadRanges(
				DocumentCommentManager.buildThreadsFromComments(
					thisSideComments
				).filter((t) => t.length !== 0)
			);
			if (this.diffData?.diff) {
				threads = threads.map((t) => ({
					range: DocumentCommentManager.applyDiffToCommentRange(
						t.range!,
						this.diffData!.diff
					),
					comments: t.comments,
				}));
			}
			if (isPatchSetLevel) {
				threads = threads.map((thread, index) => {
					return {
						comments: thread.comments,
						range: new Range(
							new Position(index, 0),
							new Position(index, 0)
						),
					};
				});
			}
			// Hide all threads that were started after the current patchSet
			threads = threads.filter((thread) => {
				if (!fileMeta?.commit || thread.comments.length === 0) {
					return true;
				}
				const firstComment = thread.comments[0];
				if (typeof firstComment.patchSet !== 'number') {
					return true;
				}
				return firstComment.patchSet <= fileMeta.commit.number;
			});
			for (const thread of threads) {
				const line = thread.range?.start.line ?? -1;
				this._threadLineCount.set(
					line,
					(this._threadLineCount.get(line) ?? 0) + 1
				);
			}
			for (const thread of threads) {
				this.createCommentThread(thread);
			}
			return;
		})();
		this._commentLoader = loaderPromise;
		await loaderPromise;
		this._commentLoader = null;
		return this;
	}

	public registerComments(
		thread: GerritCommentThread,
		...comments: GerritCommentBase[]
	): void {
		for (const comment of comments) {
			this._threadMap.set(comment.id, thread);
			comment.thread = thread;
		}
	}

	public createCommentThread(thread: {
		range: Range | null;
		comments: GerritCommentBase[];
	}): GerritCommentThread | null {
		if (!thread.range) {
			return null;
		}

		const vscodeThread = this._commentController.createCommentThread(
			this.document,
			thread.range,
			thread.comments
		) as CommentThread & Partial<GerritCommentThreadProps>;
		this._createdThreads.add(vscodeThread);
		const gthread = GerritCommentThread.from(vscodeThread);
		gthread?.setComments(thread.comments, true);
		return gthread;
	}

	public getThreadByComment(
		comment: GerritCommentBase
	): GerritCommentThread | null {
		return this._threadMap.get(comment.id) ?? null;
	}

	public getLineThreadCount(lineNumber: number): number {
		return this._threadLineCount.get(lineNumber) ?? 0;
	}

	public dispose(): void {
		for (const thread of this._threadMap.values()) {
			thread.dispose();
		}
		this._threadMap.clear();
		this._threadLineCount.clear();
		this._createdThreads.clear();
	}
}

export class DocumentManager {
	private static _disposables: Disposable[] = [];
	private static _openDocs: Set<TextDocument> = new Set();
	private static _listeners: Set<{
		onOpen?: (doc: TextDocument) => void;
		onClose?: (doc: TextDocument) => void;
	}> = new Set();

	public static init(): typeof DocumentManager {
		this._disposables.push(
			workspace.onDidCloseTextDocument((doc) => {
				this._openDocs.delete(doc);
			})
		);
		this._disposables.push(
			workspace.onDidOpenTextDocument((doc) => {
				this._openDocs.add(doc);
			})
		);
		return DocumentManager;
	}

	public static listen(listeners: {
		onOpen?: (doc: TextDocument) => void;
		onClose?: (doc: TextDocument) => void;
	}): Disposable {
		this._listeners.add(listeners);

		return {
			dispose: () => {
				this._listeners.delete(listeners);
			},
		};
	}

	public static getAllDocs(): TextDocument[] {
		return [...this._openDocs.values()];
	}

	public static dispose(): void {
		this._disposables.forEach((d) => void d.dispose());
	}
}

export class CommentManager {
	private static readonly _commentController: CommentController =
		comments.createCommentController('gerrit', 'Gerrit');
	private static _disposables: Set<Disposable> = new Set();
	private static readonly _commentManagersByURI: Map<
		string,
		DocumentCommentManager
	> = new Map();
	private static readonly _commentManagersByChangeID: Map<
		string,
		DocumentCommentManager[]
	> = new Map();

	private static _getOrCreateManager(
		gerritReposD: Data<GerritRepo[]>,
		document: TextDocument,
		filePath: string,
		metaData: {
			changeID: string;
			revision: PatchsetDescription;
		}
	): { hadManager: boolean; manager: DocumentCommentManager } {
		if (this._commentManagersByURI.has(document.uri.toString())) {
			return {
				hadManager: true,
				manager: this._commentManagersByURI.get(
					document.uri.toString()
				)!,
			};
		}

		const manager = new DocumentCommentManager(
			gerritReposD,
			document.uri,
			this._commentController,
			filePath,
			metaData
		);
		this._commentManagersByURI.set(document.uri.toString(), manager);
		if (!this._commentManagersByChangeID.has(metaData.changeID)) {
			this._commentManagersByChangeID.set(metaData.changeID, []);
		}
		this._commentManagersByChangeID.get(metaData.changeID)!.push(manager);

		return {
			hadManager: false,
			manager,
		};
	}

	private static async _getFileRanges(
		gerritRepo: GerritRepo,
		file: GerritFile,
		document: TextDocument,
		prevData?: {
			oldDiffParsed: gitDiffParser.File;
			newHash: string;
		}
	): Promise<{
		ranges: Range[];
		diff: gitDiffParser.File;
		oldDiffParsed: gitDiffParser.File;
		newHash: string;
	} | null> {
		const result = await (async () => {
			if (prevData) {
				const hashes = await this.getFileHashObjects(
					gerritRepo,
					file,
					document
				);
				if (!hashes) {
					return null;
				}

				const modifiedHash = await gerritRepo.repository.hashObject(
					document.getText()
				);
				const modifiedDiff = await gerritRepo.repository.diffBlobs(
					prevData.newHash,
					modifiedHash
				);

				const parser =
					gitDiffParser as unknown as typeof import('gitdiff-parser').default;
				const modifiedDiffParsed = parser.parse(modifiedDiff);

				return {
					oldDiffParsed: prevData.oldDiffParsed,
					modifiedDiffParsed,
					newHash: prevData.newHash,
				};
			}

			const hashes = await this.getFileHashObjects(
				gerritRepo,
				file,
				document
			);
			if (!hashes) {
				return null;
			}

			const { modifiedHash, newHash, oldHash } = hashes;

			const [oldDiff, modifiedDiff] = await Promise.all([
				gerritRepo.repository.diffBlobs(oldHash, newHash),
				gerritRepo.repository.diffBlobs(newHash, modifiedHash),
			]);

			const parser =
				gitDiffParser as unknown as typeof import('gitdiff-parser').default;
			const oldDiffParsed = parser.parse(oldDiff);
			const modifiedDiffParsed = parser.parse(modifiedDiff);

			return {
				oldDiffParsed: oldDiffParsed[0],
				modifiedDiffParsed,
				newHash,
			};
		})();
		if (!result) {
			return null;
		}

		const { modifiedDiffParsed, oldDiffParsed, newHash } = result;

		const ranges: Range[] = [];
		for (const hunk of oldDiffParsed?.hunks ?? []) {
			const start = modifiedDiffParsed.length
				? this.mapOldPositionToNew(modifiedDiffParsed[0], hunk.newStart)
				: hunk.newStart;
			const end = modifiedDiffParsed.length
				? this.mapOldPositionToNew(
						modifiedDiffParsed[0],
						hunk.newStart + hunk.newLines - 1
					)
				: hunk.newStart + hunk.newLines - 1;
			if (start > 0 && end > 0) {
				ranges.push(new Range(start - 1, 0, end - 1, 0));
			}
		}

		return {
			ranges,
			diff: modifiedDiffParsed[0],
			oldDiffParsed,
			newHash,
		};
	}

	public static async getFileHashObjects(
		gerritRepo: GerritRepo,
		file: GerritFile,
		document: TextDocument
	): Promise<{
		oldHash: string;
		newHash: string;
		modifiedHash: string;
	} | null> {
		const [oldContent, newContent] = await FileTreeView.getFileDiffContent(
			file,
			null
		);
		const [oldHash, newHash, modifiedHash] = await Promise.all([
			gerritRepo.repository.hashObject(
				(oldContent &&
					(await FileProvider.provideMetaContent(
						new Data([gerritRepo]),
						oldContent.meta
					))) ||
					''
			),
			gerritRepo.repository.hashObject(
				(newContent &&
					(await FileProvider.provideMetaContent(
						new Data([gerritRepo]),
						newContent.meta
					))) ||
					''
			),
			gerritRepo.repository.hashObject(document.getText()),
		]);

		return {
			oldHash,
			newHash,
			modifiedHash,
		};
	}

	public static async getFileFromOpenDocument(
		gerritReposD: Data<GerritRepo[]>,
		gerritRepo: GerritRepo,
		document: TextDocument
	): Promise<GerritFile | null> {
		// No meta, might be a regular checked-out file. We look for the current change
		// and find out if the current file was changed in that change.
		const change = await GerritChange.getCurrentChangeOnce(
			gerritReposD,
			gerritRepo,
			[GerritAPIWith.CURRENT_REVISION, GerritAPIWith.CURRENT_FILES]
		);
		if (!change || change.status !== GerritChangeStatus.NEW) {
			return null;
		}
		const currentRevision = await change.getCurrentRevision();
		if (!currentRevision) {
			return null;
		}
		const files = await (await currentRevision.files(null)).getValue();
		if (!files) {
			return null;
		}

		const gitURI = gerritRepo.rootPath;
		const relativePath = path
			.relative(gitURI, document.uri.fsPath)
			.replace(/\\/g, '/');
		if (!files[relativePath]) {
			return null;
		}

		return files[relativePath];
	}

	public static mapOldPositionToNew(
		diff: gitDiffParser.File,
		line: number
	): number {
		let delta = 0;
		for (const hunk of diff.hunks) {
			if (hunk.oldStart > line) {
				// No-op
			} else if (hunk.oldStart + hunk.oldLines - 1 < line) {
				delta += hunk.newLines - hunk.oldLines;
			} else {
				delta += hunk.newLines - hunk.oldLines;
				return line + delta;
			}
		}

		return line + delta;
	}

	public static mapNewPositionToOLd(
		diff: gitDiffParser.File,
		line: number
	): number {
		let delta = 0;
		for (const hunk of diff.hunks) {
			if (hunk.newStart > line) {
				// No-op
			} else if (hunk.newStart + hunk.newLines - 1 < line) {
				delta += hunk.oldLines - hunk.newLines;
			} else {
				delta += hunk.oldLines - hunk.newLines;
				return line + delta;
			}
		}

		return line + delta;
	}

	public static init(
		gerritReposD: Data<GerritRepo[]>
	): typeof CommentManager {
		this._disposables.add(
			workspace.onDidCloseTextDocument((doc) => {
				const key = doc.uri.toString();
				if (this._commentManagersByURI.has(key)) {
					this._commentManagersByURI.get(key)!.dispose();
					this._commentManagersByURI.delete(key);
				}

				const meta = FileMetaWithSideAndBase.tryFrom(doc.uri);
				if (!meta) {
					return;
				}
				if (this._commentManagersByChangeID.has(meta.changeID)) {
					this._commentManagersByChangeID.set(
						meta.changeID,
						this._commentManagersByChangeID
							.get(meta.changeID)!
							.filter((commentManager) => {
								return (
									commentManager.document.toString() !== key
								);
							})
					);
				}
			})
		);
		this._commentController.commentingRangeProvider = {
			provideCommentingRanges: async (document) => {
				const meta = FileMetaWithSideAndBase.tryFrom(document.uri);
				if (meta) {
					const lineCount = document.lineCount;
					const { hadManager, manager } =
						CommentManager._getOrCreateManager(
							gerritReposD,
							document,
							meta.filePath,
							{
								changeID: meta.changeID,
								revision: meta.commit,
							}
						);

					if (!hadManager) {
						void manager.loadComments();
					}
					return [new Range(0, 0, lineCount - 1, 0)];
				} else {
					const gerritRepo = getCurrentGerritRepoForUri(
						gerritReposD.get(),
						document.uri,
						'silent'
					);
					if (!gerritRepo) {
						return [];
					}
					const file = await CommentManager.getFileFromOpenDocument(
						gerritReposD,
						gerritRepo,
						document
					);
					if (!file) {
						return [];
					}
					const { hadManager, manager } =
						CommentManager._getOrCreateManager(
							gerritReposD,
							document,
							file.filePath,
							{
								changeID: file.changeID,
								revision: file.currentRevision,
							}
						);

					const result = await CommentManager._getFileRanges(
						gerritRepo,
						file,
						document
					);

					if (!result) {
						return null;
					}

					if (!hadManager) {
						manager.diffData = {
							...result,
							file,
						};
						void manager.loadComments();
					}

					return result.ranges;
				}
			},
		};
		return this;
	}

	public static getFileManagerForUri(
		uri: Uri
	): DocumentCommentManager | null {
		return this._commentManagersByURI.get(uri.toString()) || null;
	}

	public static getFileManagersForChangeID(
		changeID: string
	): DocumentCommentManager[] {
		return this._commentManagersByChangeID.get(changeID) || [];
	}

	public static dispose(): void {
		this._commentController.dispose();
		this._disposables.forEach((d) => void d.dispose());
		this._commentManagersByURI.forEach((m) => m.dispose());

		this._commentManagersByURI.clear();
		this._commentManagersByChangeID.clear();
		this._disposables.clear();
	}
}

async function createComment(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	thread: GerritCommentThread,
	text: string,
	isResolved: boolean,
	parentComment = thread.lastComment
): Promise<GerritDraftComment | null> {
	const manager = CommentManager.getFileManagerForUri(thread.thread.uri);
	const range = manager?.diffData?.diff
		? DocumentCommentManager.applyDiffToCommentRange(
				thread.thread.range,
				manager.diffData.diff
			)
		: thread.thread.range;

	const meta = FileMetaWithSideAndBase.tryFrom(thread.thread.uri);
	if (!manager && !meta) {
		void window.showErrorMessage('Failed to create comment');
		return null;
	}

	const newComment = await GerritComment.create(gerritReposD, gerritRepo, {
		changeID: (meta?.changeID ?? manager?.metadata.changeID)!,
		content: text,
		filePath: (meta?.filePath ?? manager?.filePath)!,
		revision: (meta?.commit.id ?? manager?.metadata.revision.id)!,
		unresolved: !isResolved,
		replyTo: parentComment?.id,
		lineOrRange: GerritComment.vsCodeRangeToGerritRange(range),
		side: !meta || meta.side === 'BOTH' ? undefined : meta.side,
	});
	if (!newComment) {
		void window.showErrorMessage('Failed to create comment');
		return null;
	}

	thread.pushComment(newComment, CommentThreadCollapsibleState.Expanded);
	return newComment;
}

async function updateComment(
	comment: GerritCommentBase,
	commentDecorationProvider: CommentDecorationProvider,
	isResolved: boolean
): Promise<void> {
	if (comment.isDraft) {
		await (comment as GerritDraftComment).saveDraftMessage(
			commentDecorationProvider,
			isResolved
		);
		comment.mode = CommentMode.Preview;
		comment.thread?.expand();
	}
}

export async function saveComment(
	gerritReposD: Data<GerritRepo[]>,
	gerritRepo: GerritRepo,
	commentDecorationProvider: CommentDecorationProvider,
	reply: NewlyCreatedGerritCommentReply | GerritCommentBase,
	isResolved: boolean
): Promise<void> {
	if (!reply.thread) {
		return;
	}

	if ('id' in reply) {
		await updateComment(reply, commentDecorationProvider, isResolved);
	} else {
		const thread = GerritCommentThread.from(reply.thread);
		if (!thread) {
			return;
		}
		await createComment(
			gerritReposD,
			gerritRepo,
			thread,
			reply.text,
			isResolved
		);
	}
}

export async function cancelComment(
	reply: NewlyCreatedGerritCommentReply | GerritCommentBase
): Promise<void> {
	if ('id' in reply) {
		await reply.updateInThread((comment) => {
			comment.mode = CommentMode.Preview;
		});
	} else {
		if (reply.thread.comments.length === 0) {
			reply.thread.dispose();
		}
	}
}

export async function setCommentResolved(
	commentDecorationProvider: CommentDecorationProvider,
	reply: NewlyCreatedGerritCommentReply,
	isResolved: boolean
): Promise<void> {
	const gthread = GerritCommentThread.from(reply.thread);
	if (!gthread) {
		return;
	}
	await gthread.setResolved(commentDecorationProvider, isResolved);
}

export async function editComment(comment: GerritCommentBase): Promise<void> {
	await comment.updateInThread((c) => {
		c.mode = CommentMode.Editing;
	});
}

export async function deleteComment(
	comment: GerritCommentBase,
	commentDecorationProvider: CommentDecorationProvider
): Promise<void> {
	if (!comment.isDraft) {
		return;
	}
	await (comment as GerritDraftComment).delete(commentDecorationProvider);
}

export async function doneComment(comment: GerritCommentBase): Promise<void> {
	if (!comment.thread) {
		return;
	}
	await createComment(
		comment.gerritReposD,
		comment.gerritRepo,
		comment.thread,
		'Done',
		true,
		comment
	);
}

export async function ackComment(comment: GerritCommentBase): Promise<void> {
	if (!comment.thread) {
		return;
	}
	await createComment(
		comment.gerritReposD,
		comment.gerritRepo,
		comment.thread,
		'Ack',
		true,
		comment
	);
}

async function getThreadWebLink(
	gerritReposD: Data<GerritRepo[]>,
	thread: CommentThread
): Promise<string | null> {
	const gerritThread = GerritCommentThread.from(thread);
	if (!gerritThread?.lastComment) {
		void window.showErrorMessage('Failed to find comment');
		return null;
	}
	const comment = gerritThread.lastComment;
	const gerritRepo = getRepoFromUri(
		gerritReposD.get(),
		thread.uri.toString()
	);
	if (!gerritRepo) {
		void window.showErrorMessage(
			'Failed to find current gerrit repository'
		);
		return null;
	}
	const api = await getAPIForRepo(gerritReposD, gerritRepo);
	const change = await GerritChange.getChangeOnce(gerritReposD, {
		changeID: comment.changeID,
		gerritRepo: gerritRepo,
	});
	if (!api || !change) {
		void window.showErrorMessage('Failed to get comment web link');
		return null;
	}

	return api.getURL(
		`c/${change.project}/+/${change.number}/comments/${comment.id}`,
		false
	);
}

export async function copyCommentLink(
	gerritReposD: Data<GerritRepo[]>,
	thread: CommentThread
): Promise<void> {
	const url = await getThreadWebLink(gerritReposD, thread);
	if (!url) {
		return;
	}
	await env.clipboard.writeText(url);
	void window.showInformationMessage('Copied comment link!');
}

export async function openCommentOnline(
	gerritReposD: Data<GerritRepo[]>,
	thread: CommentThread
): Promise<void> {
	const url = await getThreadWebLink(gerritReposD, thread);
	if (!url) {
		return;
	}

	await env.openExternal(Uri.parse(url));
}
