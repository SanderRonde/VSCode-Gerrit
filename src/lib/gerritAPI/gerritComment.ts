import {
	Comment,
	CommentAuthorInformation,
	CommentMode,
	Position,
	Range,
	Uri,
} from 'vscode';
import {
	GerritCommentRange,
	GerritCommentResponse,
	GerritCommentSide,
} from './types';
import { GerritCommentThread } from '../../providers/comments/thread';
import { CommentManager } from '../../providers/commentProvider';
import { FileMeta } from '../../providers/fileProvider';
import { DynamicallyFetchable } from './shared';
import { GerritUser } from './gerritUser';
import { DateTime } from '../dateTime';
import { getAPI } from '../gerritAPI';

export abstract class GerritCommentBase
	extends DynamicallyFetchable
	implements Comment
{
	public id: string;
	public gerritAuthor?: GerritUser;
	public patchSet?: number;
	public commitId: string;
	public path?: string;
	public side?: GerritCommentSide;
	public parent?: number;
	public line?: number;
	public range?: GerritCommentRange;
	public inReplyTo?: string;
	public message?: string;
	public updated: DateTime;
	public tag?: string;
	public unresolved?: boolean;
	public changeMessageId: string;
	public contextLines: {
		lineNumber: number;
		contextLine: string;
	}[];
	public sourceContentType?: string;
	public mode: CommentMode = CommentMode.Preview;

	// Why is this a getter? Because ESLint crashes if it's not...
	public abstract get isDraft(): boolean;
	public abstract get author(): CommentAuthorInformation;

	public get thread(): GerritCommentThread | null {
		return (
			CommentManager.getFileManagersForUri(this.uri)
				.map((manager) => manager.getThreadByComment(this))
				.find((m) => !!m) ?? null
		);
	}

	public get contextValue(): string {
		return this.getContextValues().join(',');
	}

	public get body(): string {
		return this.message ?? '';
	}

	public set body(_str: string) {
		throw new Error('Cannot set body of a non-draft comment');
	}

	protected constructor(
		public override changeID: string,
		public uri: Uri,
		public filePath: string,
		response: GerritCommentResponse
	) {
		super();

		this.id = response.id;
		this.gerritAuthor = response.author
			? new GerritUser(response.author)
			: undefined;
		this.patchSet = response.patch_set;
		this.commitId = response.commit_id;
		this.path = response.path;
		this.side = response.side;
		this.parent = response.parent;
		this.line = response.line;
		this.range = response.range;
		this.inReplyTo = response.in_reply_to;
		this.message = response.message;
		this.updated = new DateTime(response.updated);
		this.tag = response.tag;
		this.unresolved = response.unresolved;
		this.changeMessageId = response.change_message_id;
		this.contextLines = (response.context_lines || []).map((l) => ({
			contextLine: l.context_line,
			lineNumber: l.line_number,
		}));
		this.sourceContentType = response.source_content_type;
	}

	public static async create(options: {
		content: string;
		uri: Uri;
		changeId: string;
		revision: string;
		filePath: string;
		unresolved: boolean;
		lineOrRange?: number | GerritCommentRange;
		replyTo?: string;
		side: GerritCommentSide;
	}): Promise<GerritDraftComment | null> {
		const api = await getAPI();
		if (!api) {
			return null;
		}

		return await api.createDraftComment(
			options.content,
			options.uri,
			options.changeId,
			options.revision,
			options.filePath,
			options.unresolved,
			options.side,
			options.lineOrRange,
			options.replyTo
		);
	}

	public static vsCodeRangeToGerritRange(range: Range): GerritCommentRange {
		return {
			start_line: range.start.line + 1,
			start_character: range.start.character,
			end_line: range.end.line + 1,
			end_character: range.end.character,
		};
	}

	public static gerritRangeToVSCodeRange(range: GerritCommentRange): Range {
		return new Range(
			new Position(range.start_line - 1, range.start_character),
			new Position(range.end_line - 1, range.end_character)
		);
	}

	public abstract getContextValues(): string[];

	public init(): Promise<this> {
		return Promise.resolve(this);
	}

	public async updateInThread(
		updater: (comment: GerritCommentBase) => void | Promise<void>
	): Promise<void> {
		if (!this.thread) {
			await updater(this);
			return;
		}

		await this.thread.updateComment(this, updater);
	}
}

export class GerritComment extends GerritCommentBase {
	public readonly isDraft = false as const;

	public get author(): CommentAuthorInformation {
		const authorName = this.gerritAuthor?.getName() ?? 'Unknown Author';
		return {
			name: `${authorName} @ ${this.updated.format({
				dateStyle: 'short',
			})}`,
		};
	}

	public static async from(
		changeID: string,
		uri: Uri,
		filePath: string,
		response: GerritCommentResponse
	): Promise<GerritComment> {
		return new GerritComment(changeID, uri, filePath, response).init();
	}

	public static async getForMeta(
		meta: FileMeta,
		uri: Uri
	): Promise<Map<string, GerritComment[]>> {
		const api = await getAPI();
		if (!api) {
			return Promise.resolve(new Map() as Map<string, GerritComment[]>);
		}

		return await api.getComments(meta.changeId, uri);
	}

	public getContextValues(): string[] {
		const values: string[] = [];
		const thread = this.thread;
		if (!thread?.resolved && thread?.comments.every((c) => !c.isDraft)) {
			values.push('quickActionable');
		}
		return values;
	}
}

export class GerritDraftComment extends GerritCommentBase implements Comment {
	private _draftMessage: string | undefined = undefined;
	private _self: GerritUser | null = null;
	public readonly isDraft = true as const;

	public get author(): CommentAuthorInformation {
		const authorName = this._self?.getName() ?? 'Unknown Author';
		return {
			name: `${authorName} @ ${this.updated.format({
				dateStyle: 'short',
			})}`,
		};
	}

	public get label(): string {
		return 'Draft';
	}

	public override get body(): string {
		return super.body;
	}

	public override set body(str: string) {
		this._draftMessage = str;
	}

	public static from(
		changeID: string,
		uri: Uri,
		filePath: string,
		response: GerritCommentResponse
	): Promise<GerritDraftComment> {
		return new GerritDraftComment(changeID, uri, filePath, response).init();
	}

	public static async getForMeta(
		meta: FileMeta,
		uri: Uri
	): Promise<Map<string, GerritDraftComment[]>> {
		const api = await getAPI();
		if (!api) {
			return Promise.resolve(
				new Map() as Map<string, GerritDraftComment[]>
			);
		}

		return await api.getDraftComments(meta.changeId, uri);
	}

	public getContextValues(): string[] {
		return ['editable', 'deletable'];
	}

	public override async init(): Promise<this> {
		await super.init();
		this._self = await GerritUser.getSelf();
		return this;
	}

	public async setMessage(message: string): Promise<void> {
		if (message !== this.message) {
			return;
		}

		const api = await getAPI();
		if (!api) {
			return;
		}

		const newComment = await api.updateDraftComment(this, {
			content: message,
		});
		if (newComment) {
			this.updated = newComment.updated;
			this.message = newComment.message;
		}
	}

	public async setResolved(isResolved: boolean): Promise<void> {
		if (this.unresolved !== isResolved) {
			return;
		}

		const api = await getAPI();
		if (!api) {
			return;
		}

		const newComment = await api.updateDraftComment(this, {
			unresolved: !isResolved,
		});
		if (newComment) {
			this.updated = newComment.updated;
			this.unresolved = newComment.unresolved;
		}
	}

	public async saveDraftMessage(
		resolvedStatus: boolean | null = null
	): Promise<void> {
		const draft = this._draftMessage;
		this._draftMessage = undefined;
		if (draft !== undefined || resolvedStatus !== undefined) {
			await this.updateInThread(async (c) => {
				const api = await getAPI();
				if (!api) {
					return;
				}

				const newComment = await api.updateDraftComment(
					c as GerritDraftComment,
					{
						content: draft,
						unresolved:
							resolvedStatus === null
								? undefined
								: !resolvedStatus,
					}
				);
				if (newComment) {
					this.updated = newComment.updated;
					this.message = newComment.message;
					this.unresolved = newComment.unresolved;
				}
			});
		} else {
			this.thread?.refreshComments();
		}
	}

	public async delete(): Promise<boolean> {
		const api = await getAPI();
		if (!api) {
			return false;
		}

		const deleted = await api.deleteDraftComment(this);
		if (!deleted) {
			return false;
		}

		if (this.thread) {
			this.thread.removeComment(this);
		}

		return true;
	}
}
