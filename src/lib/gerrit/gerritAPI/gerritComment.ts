import { PATCHSET_LEVEL_KEY } from '../../../views/activityBar/changes/changeTreeView/patchSetLevelCommentsTreeView';
import {
	COMMENT_IS_DELETABLE,
	COMMENT_IS_EDITABLE,
	COMMENT_QUICK_ACTIONS_POSSIBLE,
} from '../../util/magic';
import {
	Comment,
	CommentAuthorInformation,
	CommentMode,
	Position,
	Range,
	Uri,
} from 'vscode';
import { getCommentDecorationProvider } from '../../../providers/commentDecorationProvider';
import {
	GerritCommentRange,
	GerritCommentResponse,
	GerritCommentSide,
} from './types';
import { APISubscriptionManager } from '../../subscriptions/subscriptions';
import { MATCH_ANY } from '../../subscriptions/baseSubscriptions';
import { GerritCommentThread } from './gerritCommentThread';
import { FileMeta } from '../../../providers/fileProvider';
import { DynamicallyFetchable } from './shared';
import { DateTime } from '../../util/dateTime';
import { GerritUser } from './gerritUser';
import { getAPI } from '../gerritAPI';

export abstract class GerritCommentBase
	extends DynamicallyFetchable
	implements Comment
{
	public thread: GerritCommentThread | null = null;
	public id: string;
	public gerritAuthor?: GerritUser;
	public patchSet?: number;
	public commitID: string;
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
	public changeMessageID: string;
	public contextLines: {
		lineNumber: number;
		contextLine: string;
	}[];
	public sourceContentType?: string;
	public mode: CommentMode = CommentMode.Preview;

	// Why is this a getter? Because ESLint crashes if it's not...
	public abstract get isDraft(): boolean;
	public abstract get author(): CommentAuthorInformation;

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
		public filePath: string,
		response: GerritCommentResponse
	) {
		super();

		this.id = response.id;
		this.gerritAuthor = response.author
			? new GerritUser(response.author)
			: undefined;
		this.patchSet = response.patch_set;
		this.commitID = response.commit_id;
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
		this.changeMessageID = response.change_message_id;
		this.contextLines = (response.context_lines || []).map((l) => ({
			contextLine: l.context_line,
			lineNumber: l.line_number,
		}));
		this.sourceContentType = response.source_content_type;
	}

	public static async create(options: {
		content: string;
		changeID: string;
		revision: string;
		filePath: string;
		unresolved: boolean;
		lineOrRange?: number | GerritCommentRange;
		replyTo?: string;
		side: GerritCommentSide | undefined;
	}): Promise<GerritDraftComment | null> {
		const api = await getAPI();
		if (!api) {
			return null;
		}

		if (options.filePath === PATCHSET_LEVEL_KEY) {
			return await api.createPatchSetLevelDraftComment(options);
		}

		return await api.createDraftComment(options);
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
		filePath: string,
		response: GerritCommentResponse
	): Promise<GerritComment> {
		return new GerritComment(changeID, filePath, response).init();
	}

	public getContextValues(): string[] {
		const values: string[] = [];
		const thread = this.thread;
		if (!thread?.resolved) {
			values.push(COMMENT_QUICK_ACTIONS_POSSIBLE);
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
		filePath: string,
		response: GerritCommentResponse
	): Promise<GerritDraftComment> {
		return new GerritDraftComment(changeID, filePath, response).init();
	}

	public static async refreshComments(uri: Uri): Promise<void> {
		await getCommentDecorationProvider().refreshFileComments(uri);

		const meta = FileMeta.tryFrom(uri);
		await APISubscriptionManager.commentsSubscriptions.invalidate({
			changeID: !meta ? MATCH_ANY : meta.changeID,
			field: null,
			withValues: [],
		});
	}

	public getContextValues(): string[] {
		return [COMMENT_IS_EDITABLE, COMMENT_IS_DELETABLE];
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

		const newComment = await api.updateDraftComment({
			draft: this,
			changes: {
				content: message,
			},
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

		const newComment = await api.updateDraftComment({
			draft: this,
			changes: {
				unresolved: !isResolved,
			},
		});
		if (newComment) {
			this.updated = newComment.updated;
			this.unresolved = newComment.unresolved;
		}

		const uri = this.thread?.thread.uri;
		if (uri) {
			await GerritDraftComment.refreshComments(uri);
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

				const newComment = await api.updateDraftComment({
					draft: c as GerritDraftComment,
					changes: {
						content: draft,
						unresolved:
							resolvedStatus === null
								? undefined
								: !resolvedStatus,
					},
				});
				if (newComment) {
					this.updated = newComment.updated;
					this.message = newComment.message;
					this.unresolved = newComment.unresolved;
				}
			});
		} else {
			this.thread?.refreshComments();
		}

		const uri = this.thread?.thread.uri;
		if (uri) {
			await GerritDraftComment.refreshComments(uri);
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
			const uri = this.thread?.thread.uri;
			if (uri) {
				await GerritDraftComment.refreshComments(uri);
			}
		}

		return true;
	}
}
