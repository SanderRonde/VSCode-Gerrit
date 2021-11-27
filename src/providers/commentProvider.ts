import {
	CommentController,
	comments,
	CommentThread,
	CommentThreadCollapsibleState,
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
	id: string;
	resolved: boolean;
}

export interface GerritCommentThread
	extends CommentThread,
		GerritCommentThreadProps {}

class DocumentCommentManager implements Disposable {
	static _lastThreadId: number = 0;

	private _commentMap: Map<string, GerritCommentBase[]> = new Map();
	private _threadMap: Map<string, GerritCommentThread> = new Map();

	constructor(
		private readonly document: Uri,
		private readonly commentController: CommentController
	) {}

	async init() {
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
			if (commentThread) {
				this._threadMap.set(thread[0].id, commentThread);
			}
			this._commentMap.set(thread[0].id, thread);
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

	createCommentThread(
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

		const thread = this.commentController.createCommentThread(
			this.document,
			range,
			comments
		) as CommentThread & Partial<GerritCommentThreadProps>;
		const lastComment = comments[comments.length - 1];
		thread.label = 'Comment';
		thread.contextValue = lastComment.isDraft ? 'draft' : 'comment';
		thread.id = comments[0].id;

		thread.resolved = !(lastComment.unresolved ?? false);
		thread.collapsibleState = thread.resolved
			? CommentThreadCollapsibleState.Collapsed
			: CommentThreadCollapsibleState.Expanded;
		return thread as GerritCommentThread;
	}

	dispose() {
		for (const thread of this._threadMap.values()) {
			thread.dispose();
		}
		this._threadMap.clear();
		this._commentMap.clear();
	}
}

export class CommentManager implements Disposable {
	private readonly _commentController: CommentController =
		comments.createCommentController('gerrit', 'Gerrit');
	private _disposables: Set<Disposable> = new Set();
	private readonly _commentManagers: Map<string, DocumentCommentManager> =
		new Map();

	constructor() {
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
					})();
					return [new Range(0, 0, lineCount - 1, 0)];
				}
				return [];
			},
		};
	}

	dispose() {
		this._commentController.dispose();
		this._disposables.forEach((d) => d.dispose());
		this._commentManagers.forEach((m) => m.dispose());
		this._disposables = new Set();
	}
}

export async function createComment(reply: NewlyCreatedGerritCommentReply) {
	const thread = reply.thread;
	const meta = FileProvider.getFileMeta(thread.uri);

	const parentComment =
		thread.comments.length > 0
			? thread.comments[thread.comments.length - 1]
			: undefined;
	const newComment = await GerritComment.create({
		changeId: meta.changeId,
		content: reply.text,
		filePath: meta.filePath,
		revision: meta.commit,
		unresolved: true, // TODO:
		replyTo: parentComment
			? GerritComment.getFromVSCodeComment(parentComment)?.id
			: undefined,
		lineOrRange: GerritComment.vsCodeRangeToGerritRange(reply.thread.range),
		side: meta.side,
	});
	if (!newComment) {
		window.showErrorMessage('Failed to create comment');
		thread.comments = [...thread.comments];
		return;
	}
	thread.label = 'Comment';
	thread.comments = [...thread.comments, newComment];
	thread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
}

export function cancelComment(reply: NewlyCreatedGerritCommentReply) {
	const thread = reply.thread;
	thread.dispose();
}
