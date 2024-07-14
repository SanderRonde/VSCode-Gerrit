import {
	COMMENT_THREAD_IS_NOT_RESOLVED,
	COMMENT_THREAD_IS_RESOLVED,
	LAST_COMMENT_WAS_DRAFT,
} from '../../util/magic';
import { PATCHSET_LEVEL_KEY } from '../../../views/activityBar/changes/changeTreeView/patchSetLevelCommentsTreeView';
import {
	CommentManager,
	DocumentCommentManager,
} from '../../../providers/commentProvider';
import { GerritCommentBase, GerritDraftComment } from './gerritComment';
import { CommentThread, CommentThreadCollapsibleState } from 'vscode';
import { OnceDisposable } from '../../classes/onceDisposable';
import { FileMeta } from '../../../providers/fileProvider';
import { ExpandComments } from '../../../commands/types';
import { getConfiguration } from '../../vscode/config';
import { CacheContainer } from '../../util/cache';

interface CommentThreadWithGerritComments
	extends Omit<CommentThread, 'comments'> {
	comments: readonly GerritCommentBase[];
}

/**
 * We use a bit of a fancy technique for keeping track of threads. We are not
 * allowed to store any extra properties on the VSCode CommentThread. This means
 * we need to use a custom class to keep track of the thread. To link the thread
 * to the custom class, we use the `threadID` property. Because we can't store
 * it directly on the thread, we store it in editable the `contextValue` property.
 */
export class GerritCommentThread extends OnceDisposable {
	private static _lastThreadID: number = 0;
	private static _threadMap: CacheContainer<string, GerritCommentThread> =
		new CacheContainer();

	private readonly _threadID: string;
	private readonly _thread: CommentThreadWithGerritComments;
	private readonly _filePath: string | undefined;

	private get _manager(): DocumentCommentManager | null {
		return CommentManager.getFileManagerForUri(this._thread.uri);
	}

	public get lastComment(): Readonly<GerritCommentBase> | undefined {
		return this._thread.comments[this._thread.comments.length - 1];
	}

	public get comments(): ReadonlyArray<GerritCommentBase> {
		return this._thread.comments;
	}

	public get thread(): Readonly<CommentThreadWithGerritComments> {
		return this._thread;
	}

	public get resolved(): boolean {
		return !(this.lastComment?.unresolved ?? false);
	}

	private constructor(
		thread: CommentThread,
		private readonly _isInWritableEditor: boolean
	) {
		super();
		this._threadID = GerritCommentThread._setThreadID(thread, this);
		this._thread = thread as CommentThreadWithGerritComments;
		const meta = FileMeta.tryFrom(thread.uri);
		if (meta) {
			this._filePath = meta.filePath;
		}
	}

	private static _generateID(): number {
		return this._lastThreadID++;
	}

	private static _getThreadID(thread: CommentThread): string | null {
		const contextValue = thread.contextValue;
		if (!contextValue) {
			return null;
		}
		const [id] = contextValue.split('|');
		return id;
	}

	private static _setThreadID(
		thread: CommentThread,
		instance: GerritCommentThread
	): string {
		const id = GerritCommentThread._generateID();
		thread.contextValue = `${id}|`;
		GerritCommentThread._threadMap.set(String(id), instance);
		return String(id);
	}

	public static from(thread: CommentThread): GerritCommentThread | null {
		const id = GerritCommentThread._getThreadID(thread);
		if (id && GerritCommentThread._threadMap.has(id)) {
			return GerritCommentThread._threadMap.get(id)!;
		}
		const isInWritableEditor = !FileMeta.tryFrom(thread.uri);
		const gthread = new GerritCommentThread(thread, isInWritableEditor);
		const manager = CommentManager.getFileManagerForUri(thread.uri);
		if (!manager) {
			return null;
		}

		return gthread;
	}

	private _setContextValue(contextValue: string): void {
		this._thread.contextValue = `${this._threadID}|${contextValue}`;
	}

	private _updateContextValues(): void {
		const contextValues: string[] = [];
		// Use yes/no here because the string "resolved" is in "unresolved"
		contextValues.push(
			this.resolved
				? COMMENT_THREAD_IS_RESOLVED
				: COMMENT_THREAD_IS_NOT_RESOLVED
		);
		contextValues.push(
			!this.lastComment || this.lastComment.isDraft
				? LAST_COMMENT_WAS_DRAFT
				: ''
		);
		this._setContextValue(contextValues.join(','));
	}

	private _isMultipleOnLine(): boolean {
		if (!this._filePath || !this.lastComment) {
			return false;
		}
		const range = DocumentCommentManager.getCommentRange(this.lastComment);
		if (!range) {
			return false;
		}
		const manager = CommentManager.getFileManagerForUri(this.thread.uri);
		const threadCount: number = manager
			? manager.getLineThreadCount(range.start.line)
			: 0;
		if (threadCount > 1) {
			return true;
		}
		return false;
	}

	private _isPatchsetLevel(): boolean {
		return this._filePath === PATCHSET_LEVEL_KEY;
	}

	private _shouldOverrideInitialExpand(): CommentThreadCollapsibleState | null {
		if (this._isInWritableEditor) {
			return CommentThreadCollapsibleState.Collapsed;
		}

		if (this._isPatchsetLevel()) {
			return CommentThreadCollapsibleState.Expanded;
		}

		return null;
	}

	private _shouldExpandComments(): CommentThreadCollapsibleState {
		const overrideExpand = this._shouldOverrideInitialExpand();
		if (overrideExpand !== null) {
			return overrideExpand;
		}

		const expandState = getConfiguration().get('gerrit.expandComments');
		if (expandState === ExpandComments.NEVER) {
			return CommentThreadCollapsibleState.Collapsed;
		} else if (expandState === ExpandComments.ALWAYS) {
			return CommentThreadCollapsibleState.Expanded;
		}

		// If there are multiple threads on this line, expand them all.
		// VSCode is really bad at showing multiple comments on a line.
		return !this.resolved || this._isMultipleOnLine()
			? CommentThreadCollapsibleState.Expanded
			: CommentThreadCollapsibleState.Collapsed;
	}

	public async setResolved(newValue: boolean): Promise<void> {
		if (!this.lastComment?.isDraft) {
			return;
		}

		await (this.lastComment as GerritDraftComment).setResolved(newValue);
		this.update(false);
	}

	public update(isInitial: boolean): void {
		this._updateContextValues();

		this._thread.label = 'Comment';
		if (!this.resolved) {
			this._thread.label = 'Comment (unresolved)';
		}

		this._thread.canReply = !this.lastComment?.isDraft;

		if (isInitial) {
			this._thread.collapsibleState = this._shouldExpandComments();
		}
	}

	public setComments(
		comments: readonly GerritCommentBase[],
		isInitial: boolean = false
	): void {
		this._manager?.registerComments(this, ...comments);
		this._thread.comments = comments;
		this.update(isInitial);

		if (this._thread.comments.length === 0) {
			this._thread.dispose();
		}
	}

	public pushComment(
		comment: GerritCommentBase,
		collapseState?: CommentThreadCollapsibleState
	): void {
		this._manager?.registerComments(this, comment);
		const isInitial: boolean = this._thread.comments.length === 0;
		this._thread.comments = [...this._thread.comments, comment];
		this.update(isInitial);
		if (collapseState) {
			this._thread.collapsibleState = collapseState;
		}
	}

	public async updateComment(
		comment: GerritCommentBase,
		updater: (comment: GerritCommentBase) => void | Promise<void>
	): Promise<void> {
		this.setComments(
			await Promise.all(
				this._thread.comments.map(async (c) => {
					if (c.id === comment.id) {
						await updater(c);
					}
					return c;
				})
			)
		);
	}

	public removeComment(comment: GerritCommentBase): void {
		this.setComments(
			this._thread.comments.filter((c) => {
				if (c.id === comment.id) {
					return false;
				}
				return true;
			})
		);
	}

	public expand(): void {
		this._thread.collapsibleState = CommentThreadCollapsibleState.Expanded;
	}

	/**
	 * Sets comments with themselves. This triggers the VSCode set
	 * listener, which will update the thread.
	 */
	public refreshComments(): void {
		this.setComments(this.comments);
	}

	public override dispose(): void {
		if (!super.dispose()) {
			return;
		}
		GerritCommentThread._threadMap.delete(this._threadID);
		this._thread.dispose();
	}
}
