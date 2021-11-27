import {
	GerritCommentBase,
	GerritDraftComment,
} from '../../lib/gerritAPI/gerritComment';
import {
	CommentThread,
	CommentThreadCollapsibleState,
	Disposable,
} from 'vscode';

/**
 * We use a bit of a fancy technique for keeping track of threads. We are not
 * allowed to store any extra properties on the VSCode CommentThread. This means
 * we need to use a custom class to keep track of the thread. To link the thread
 * to the custom class, we use the `threadId` property. Because we can't store
 * it directly on the thread, we store it in editable the `contextValue` property.
 */
export class GerritCommentThread implements Disposable {
	private static _lastThreadId: number = 0;
	private static _threadMap: Map<string, GerritCommentThread> = new Map();

	private _threadID: string;
	private _thread: CommentThread;
	private _comments: GerritCommentBase[] = [];

	public get lastComment(): Readonly<GerritCommentBase> | undefined {
		return this._comments[this._comments.length - 1];
	}

	public get comments(): ReadonlyArray<GerritCommentBase> {
		return this._comments;
	}

	public get thread(): Readonly<CommentThread> {
		return this._thread;
	}

	public get resolved(): boolean {
		return !(this.lastComment?.unresolved ?? false);
	}

	public async setResolved(newValue: boolean): Promise<void> {
		if (!this.lastComment?.isDraft) {
			return;
		}

		await (this.lastComment as GerritDraftComment).setResolved(newValue);
		this.update(false);
	}

	private constructor(thread: CommentThread) {
		this._threadID = GerritCommentThread._setThreadID(thread, this);
		this._thread = thread;
	}

	private static _generateID(): number {
		return this._lastThreadId++;
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

	public static from(thread: CommentThread): GerritCommentThread {
		const id = GerritCommentThread._getThreadID(thread);
		if (id && GerritCommentThread._threadMap.has(id)) {
			return GerritCommentThread._threadMap.get(id)!;
		}
		return new GerritCommentThread(thread);
	}

	private _setContextValue(contextValue: string): void {
		this._thread.contextValue = `${this._threadID}|${contextValue}`;
	}

	private _updateContextValues(): void {
		const contextValues: string[] = [];
		// Use yes/no here because the string "resolved" is in "unresolved"
		contextValues.push(this.resolved ? 'yesResolved' : 'noResolved');
		contextValues.push(
			!this.lastComment || this.lastComment.isDraft
				? 'yesLastCommentDraft'
				: 'nodLastCommentDaft'
		);
		this._setContextValue(contextValues.join(','));
	}

	public update(isInitial: boolean): void {
		this._updateContextValues();

		this._thread.label = 'Comment';
		if (!this.resolved) {
			this._thread.label = 'Comment (unresolved)';
		}

		if (isInitial) {
			this._thread.collapsibleState = this.resolved
				? CommentThreadCollapsibleState.Collapsed
				: CommentThreadCollapsibleState.Expanded;
		}
	}

	public setComments(comments: GerritCommentBase[]): void {
		this._thread.comments = comments;
		this._comments = [...comments];
		this.update(true);
	}

	public pushComment(comment: GerritCommentBase): void {
		const isInitial: boolean = this._thread.comments.length === 0;
		this._thread.comments = [...this._thread.comments, comment];
		this._comments = [...this._comments, comment];
		this.update(isInitial);
	}

	public collapse(): void {
		this._thread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
	}

	public expand(): void {
		this._thread.collapsibleState = CommentThreadCollapsibleState.Expanded;
	}

	public dispose(): void {
		GerritCommentThread._threadMap.delete(this._threadID);
		this._thread.dispose();
	}
}
