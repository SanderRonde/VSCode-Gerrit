import {
	CommentController,
	comments,
	CommentThread,
	Disposable,
	Position,
	Range,
	Uri,
	window,
	workspace,
} from 'vscode';
import {
	GerritComment,
	GerritCommentBase,
	GerritDraftComment,
} from '../lib/gerritAPI/gerritComment';
import { DateSortDirection, DateTime } from '../lib/dateTime';
import { GerritCommentSide } from '../lib/gerritAPI/types';
import { GerritCommentThread } from './comments/thread';
import { FileProvider } from './fileProvider';
import { uniqueComplex } from '../lib/util';

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

class DocumentCommentManager implements Disposable {
	public static _lastThreadId = 0;

	private _threadMap: Map<string, GerritCommentThread> = new Map();

	public constructor(
		private readonly document: Uri,
		private readonly commentController: CommentController
	) {}

	public async init(): Promise<this> {
		const fileMeta = FileProvider.tryGetFileMeta(this.document);
		if (!fileMeta) {
			return this;
		}

		const comments =
			(await GerritComment.getForMeta(fileMeta)).get(fileMeta.filePath) ??
			[];
		const draftComments =
			(await GerritDraftComment.getForMeta(fileMeta)).get(
				fileMeta.filePath
			) ?? [];
		const allComments = [...comments, ...draftComments];
		const thisSideComments = allComments.filter(
			(c) => c.side ?? GerritCommentSide.RIGHT === fileMeta.side
		);
		for (const thread of this._buildThreadsFromComments(thisSideComments)) {
			if (thread.length === 0) {
				continue;
			}
			const commentThread = this.createCommentThread(thread);
			thread.forEach((comment) => {
				if (commentThread) {
					this._threadMap.set(comment.id, commentThread);
				}
			});
		}
		return this;
	}

	private _getAllRepliesTo(
		comment: GerritCommentBase,
		allComments: GerritCommentBase[]
	): GerritCommentBase[] {
		const replies: GerritCommentBase[] = [comment];
		const directReplies = allComments.filter(
			(c) => c.inReplyTo === comment.id
		);
		replies.push(...directReplies);
		for (const reply of directReplies) {
			replies.push(...this._getAllRepliesTo(reply, allComments));
		}
		return uniqueComplex(replies, (c) => c.id);
	}

	private _buildThreadsFromComments(
		comments: GerritCommentBase[]
	): GerritCommentBase[][] {
		return comments
			.filter((c) => !c.inReplyTo)
			.map((c) => this._getAllRepliesTo(c, comments))
			.map((t) =>
				DateTime.sortByDate(
					t,
					DateSortDirection.INCREASING_TIME,
					(c) => c.updated
				)
			);
	}

	public createCommentThread(
		comments: GerritCommentBase[]
	): GerritCommentThread | null {
		const range = (() => {
			if (comments[0].range) {
				return GerritComment.gerritRangeToVSCodeRange(
					comments[0].range
				);
			}
			if (comments[0].line) {
				return new Range(
					new Position(comments[0].line, 0),
					new Position(comments[0].line, 0)
				);
			}
			return null;
		})();
		if (!range) {
			return null;
		}

		const vscodeThread = this.commentController.createCommentThread(
			this.document,
			range,
			comments
		) as CommentThread & Partial<GerritCommentThreadProps>;
		const thread = GerritCommentThread.from(vscodeThread);
		thread.setComments(comments);
		return thread;
	}

	public getThread(comment: GerritCommentBase): GerritCommentThread | null {
		return this._threadMap.get(comment.id) ?? null;
	}

	public collapseAll(): void {
		[...this._threadMap.values()].forEach((thread) => thread.collapse());
	}

	public dispose(): void {
		for (const thread of this._threadMap.values()) {
			thread.dispose();
		}
		this._threadMap.clear();
	}
}

export class CommentManager {
	private static readonly _commentController: CommentController =
		comments.createCommentController('gerrit', 'Gerrit');
	private static _disposables: Set<Disposable> = new Set();
	private static readonly _commentManagers: Map<
		string,
		DocumentCommentManager
	> = new Map();
	private static readonly _commentManagersByFilePath: Map<
		string,
		DocumentCommentManager[]
	> = new Map();

	public static init(): typeof CommentManager {
		this._disposables.add(
			workspace.onDidCloseTextDocument((doc) => {
				const meta = FileProvider.tryGetFileMeta(doc.uri);
				if (!meta) {
					return;
				}
				const key = FileProvider.fileMetaToKey(meta);
				if (this._commentManagers.has(key)) {
					this._commentManagers.get(key)!.dispose();
					this._commentManagers.delete(key);
				}
			})
		);
		this._commentController.commentingRangeProvider = {
			provideCommentingRanges: (document) => {
				// TODO: maybe do this when checked out as well?
				const meta = FileProvider.tryGetFileMeta(document.uri);
				if (meta) {
					const lineCount = document.lineCount;
					void (async () => {
						const manager = await new DocumentCommentManager(
							document.uri,
							this._commentController
						).init();
						this._commentManagers.set(
							FileProvider.fileMetaToKey(meta),
							manager
						);
						if (
							!this._commentManagersByFilePath.has(meta.filePath)
						) {
							this._commentManagersByFilePath.set(
								meta.filePath,
								[]
							);
						}
						this._commentManagersByFilePath
							.get(meta.filePath)!
							.push(manager);
					})();
					return [new Range(0, 0, lineCount - 1, 0)];
				}
				return null;
			},
		};
		return this;
	}

	public static getFileManagersForPath(
		filePath: string
	): DocumentCommentManager[] {
		return this._commentManagersByFilePath.get(filePath) ?? [];
	}

	public static collapseAll(): void {
		const editor = window.activeTextEditor;
		if (!editor) {
			return;
		}

		const meta = FileProvider.tryGetFileMeta(editor.document.uri);
		if (!meta) {
			return;
		}

		const managers = this.getFileManagersForPath(meta.filePath);
		for (const manager of managers) {
			manager.collapseAll();
		}
	}

	public static dispose(): void {
		this._commentController.dispose();
		this._disposables.forEach((d) => void d.dispose());
		this._commentManagers.forEach((m) => m.dispose());
		this._commentManagersByFilePath.forEach(
			(a) => void a.forEach((m) => void m.dispose())
		);
		this._disposables = new Set();
	}
}

export async function createComment(
	reply: NewlyCreatedGerritCommentReply,
	isResolved: boolean
): Promise<void> {
	const gthread = GerritCommentThread.from(reply.thread);
	const meta = FileProvider.getFileMeta(gthread.thread.uri);

	const newComment = await GerritComment.create({
		changeId: meta.changeId,
		content: reply.text,
		filePath: meta.filePath,
		revision: meta.commit,
		unresolved: !isResolved,
		replyTo: gthread.lastComment
			? GerritComment.getFromVSCodeComment(gthread.lastComment)?.id
			: undefined,
		lineOrRange: GerritComment.vsCodeRangeToGerritRange(reply.thread.range),
		side: meta.side,
	});
	if (!newComment) {
		await window.showErrorMessage('Failed to create comment');
		return;
	}

	gthread.pushComment(newComment);
}

export function cancelComment(reply: NewlyCreatedGerritCommentReply): void {
	const thread = reply.thread;
	if (thread.comments.length === 0) {
		thread.dispose();
	}
}

export async function setCommentResolved(
	reply: NewlyCreatedGerritCommentReply,
	isResolved: boolean
): Promise<void> {
	const gthread = GerritCommentThread.from(reply.thread);
	await gthread.setResolved(isResolved);
}

export function collapseAllComments(): void {
	CommentManager.collapseAll();
}
