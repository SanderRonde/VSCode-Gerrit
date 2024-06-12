import {
	Event,
	EventEmitter,
	FileDecoration,
	FileDecorationProvider,
	Uri,
} from 'vscode';
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { FileMeta, GERRIT_FILE_SCHEME } from './fileProvider';
import { DocumentCommentManager } from './commentProvider';

class CommentDecorationProvider implements FileDecorationProvider {
	private _fileUnresolvedCommentCounts: Map<string, Map<string, number>> =
		new Map();
	private _onDidChangeFileDecorations: EventEmitter<Uri | Uri[]> =
		new EventEmitter<Uri | Uri[]>();
	public onDidChangeFileDecorations: Event<Uri | Uri[]> =
		this._onDidChangeFileDecorations.event;

	private async _getUnresolvedCommentCount(
		changeID: string,
		filePath: string,
		uri: Uri
	): Promise<number> {
		const allCommentsSubscription =
			await GerritChange.getAllComments(changeID);
		const allComments = await allCommentsSubscription.getValue();
		allCommentsSubscription.subscribeOnce(
			new WeakRef(() => this.refreshFileComments(uri))
		);
		const fileComments = allComments.get(filePath);
		if (!fileComments) {
			return 0;
		}
		const threads =
			DocumentCommentManager.buildThreadsFromComments(fileComments);
		return threads.filter((thread) => {
			if (thread.length === 0) {
				return false;
			}
			return thread[thread.length - 1].unresolved === true;
		}).length;
	}

	private async _setUnresolvedCommentCount(
		meta: FileMeta,
		uri: Uri
	): Promise<number> {
		const count = await this._getUnresolvedCommentCount(
			meta.changeID,
			meta.filePath,
			uri
		);
		if (!this._fileUnresolvedCommentCounts.has(meta.changeID)) {
			this._fileUnresolvedCommentCounts.set(meta.changeID, new Map());
		}
		this._fileUnresolvedCommentCounts
			.get(meta.changeID)!
			.set(meta.filePath, count);
		return count;
	}

	private _getStoredCommentCount(meta: FileMeta): number {
		if (!this._fileUnresolvedCommentCounts.has(meta.changeID)) {
			return -1;
		}
		return (
			this._fileUnresolvedCommentCounts
				.get(meta.changeID)!
				.get(meta.filePath) ?? -1
		);
	}

	public async refreshFileComments(uri: Uri): Promise<void> {
		const meta = FileMeta.tryFrom(uri);
		if (!meta) {
			return;
		}
		const count = await this._getUnresolvedCommentCount(
			meta.changeID,
			meta.filePath,
			uri
		);
		const storedCount = this._getStoredCommentCount(meta);
		if (storedCount !== count) {
			if (!this._fileUnresolvedCommentCounts.has(meta.changeID)) {
				this._fileUnresolvedCommentCounts.set(meta.changeID, new Map());
			}
			this._fileUnresolvedCommentCounts
				.get(meta.changeID)!
				.set(meta.filePath, count);
			this._onDidChangeFileDecorations.fire(uri);
		}
	}

	public async provideFileDecoration(
		uri: Uri
	): Promise<FileDecoration | undefined> {
		if (uri.scheme !== GERRIT_FILE_SCHEME) {
			return;
		}
		const meta = FileMeta.tryFrom(uri);
		if (!meta || meta.isEmpty()) {
			return;
		}
		const storedCount = this._getStoredCommentCount(meta);
		const count =
			storedCount === -1
				? await this._setUnresolvedCommentCount(meta, uri)
				: storedCount;

		if (count > 0) {
			return {
				propagate: false,
				tooltip: 'Unresolved comments',
				badge: '💬',
			};
		}

		return;
	}
}

let commentDecorationProvider: CommentDecorationProvider | null = null;
export function getCommentDecorationProvider(): CommentDecorationProvider {
	if (commentDecorationProvider) {
		return commentDecorationProvider;
	}
	return (commentDecorationProvider = new CommentDecorationProvider());
}
