import {
	Comment,
	CommentAuthorInformation,
	CommentMode,
	Position,
	Range,
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
	public patchSet?: string;
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

	// Why is this a getter? Because ESLint crashes if it's not...
	public abstract get isDraft(): boolean;
	public abstract get author(): CommentAuthorInformation;
	public abstract getContextValues(): string[];

	protected constructor(
		protected _patchID: string,
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

	public get body(): string {
		return this.message ?? '';
	}

	public get mode(): CommentMode {
		return CommentMode.Preview;
	}

	public get thread(): GerritCommentThread | null {
		return (
			CommentManager.getFileManagersForPath(this.filePath)
				.map((manager) => manager.getThread(this))
				.find((m) => !!m) ?? null
		);
	}

	public get contextValue(): string {
		return this.getContextValues().join(',');
	}

	public init(): Promise<this> {
		return Promise.resolve(this);
	}

	private static _vsCodeMap: Map<Comment, GerritComment> = new Map();

	public static getFromVSCodeComment(comment: Comment): GerritComment | null {
		return GerritComment._vsCodeMap.get(comment) ?? null;
	}

	public static async create(options: {
		content: string;
		changeId: string;
		revision: string;
		filePath: string;
		unresolved: boolean;
		lineOrRange?: number | GerritCommentRange;
		replyTo?: string;
		side: GerritCommentSide;
	}): Promise<GerritComment | null> {
		const api = await getAPI();
		if (!api) {
			return null;
		}

		return await api.createDraftComment(
			options.content,
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
			start_line: range.start.line,
			start_character: range.start.character,
			end_line: range.end.line,
			end_character: range.end.character,
		};
	}

	public static gerritRangeToVSCodeRange(range: GerritCommentRange): Range {
		return new Range(
			new Position(range.start_line, range.start_character),
			new Position(range.end_line, range.end_character)
		);
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

	public getContextValues(): string[] {
		const values: string[] = [];
		const thread = this.thread;
		if (thread?.comments.every((c) => !c.isDraft)) {
			values.push('allNonDraft');
		}
		return values;
	}

	public static async from(
		patchID: string,
		filePath: string,
		response: GerritCommentResponse
	): Promise<GerritComment> {
		return new GerritComment(patchID, filePath, response).init();
	}

	public static async getForMeta(
		meta: FileMeta
	): Promise<Map<string, GerritComment[]>> {
		const api = await getAPI();
		if (!api) {
			return Promise.resolve(new Map() as Map<string, GerritComment[]>);
		}

		return await api.getComments(meta.changeId);
	}
}

export class GerritDraftComment extends GerritCommentBase implements Comment {
	public readonly isDraft = true as const;
	private _self: GerritUser | null = null;

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

	public getContextValues(): string[] {
		return ['editable', 'deletable'];
	}

	public static from(
		patchID: string,
		filePath: string,
		response: GerritCommentResponse
	): Promise<GerritDraftComment> {
		return new GerritDraftComment(patchID, filePath, response).init();
	}

	public static async getForMeta(
		meta: FileMeta
	): Promise<Map<string, GerritDraftComment[]>> {
		const api = await getAPI();
		if (!api) {
			return Promise.resolve(
				new Map() as Map<string, GerritDraftComment[]>
			);
		}

		return await api.getDraftComments(meta.changeId);
	}

	public async init(): Promise<this> {
		this._self = await GerritUser.getSelf();
		return this;
	}

	// TODO: remove ignore
	// eslint-disable-next-line @typescript-eslint/require-await
	public async setResolved(isResolved: boolean): Promise<void> {
		this.unresolved = !isResolved;
		// TODO: XHR to update it
	}
}
