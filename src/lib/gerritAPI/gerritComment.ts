import {
	GerritCommentRange,
	GerritCommentResponse,
	GerritCommentSide,
	GerritDetailedUserResponse,
} from './types';
import {
	Comment,
	CommentAuthorInformation,
	CommentMode,
	env,
	Position,
	Range,
} from 'vscode';
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
	public gerritAuthor: GerritDetailedUserResponse;
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

	public abstract get author(): CommentAuthorInformation;

	public get body() {
		return this.message ?? '';
	}

	public get mode() {
		return CommentMode.Preview;
	}

	protected constructor(
		protected _patchID: string,
		public filePath: string,
		response: GerritCommentResponse
	) {
		super();

		this.id = response.id;
		this.gerritAuthor = response.author;
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

	async init() {
		return this;
	}

	private static _vsCodeMap: Map<Comment, GerritComment> = new Map();

	static getFromVSCodeComment(comment: Comment) {
		return GerritComment._vsCodeMap.get(comment);
	}

	static async create(options: {
		content: string;
		changeId: string;
		revision: string;
		filePath: string;
		unresolved: boolean;
		lineOrRange?: number | GerritCommentRange;
		replyTo?: string;
		side: GerritCommentSide;
	}) {
		const api = getAPI();
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

	static vsCodeRangeToGerritRange(range: Range): GerritCommentRange {
		return {
			start_line: range.start.line,
			start_character: range.start.character,
			end_line: range.end.line,
			end_character: range.end.character,
		};
	}

	static gerritRangeToVSCodeRange(range: GerritCommentRange): Range {
		return new Range(
			new Position(range.start_line, range.start_character),
			new Position(range.end_line, range.end_character)
		);
	}
}

export class GerritComment extends GerritCommentBase {
	public readonly isDraft = false as const;

	public get author(): CommentAuthorInformation {
		return {
			name:
				this.gerritAuthor.display_name ??
				this.gerritAuthor.name ??
				this.gerritAuthor.email ??
				this.gerritAuthor.username,
		};
	}

	static async from(
		patchID: string,
		filePath: string,
		response: GerritCommentResponse
	) {
		return new GerritComment(patchID, filePath, response).init();
	}

	static async getForMeta(
		meta: FileMeta
	): Promise<Map<string, GerritComment[]>> {
		const api = getAPI();
		if (!api) {
			return Promise.resolve(new Map());
		}

		return await api.getComments(meta.changeId);
	}
}

export class GerritDraftComment extends GerritCommentBase implements Comment {
	public readonly isDraft = true as const;
	private _self: GerritUser | null = null;

	public get author(): CommentAuthorInformation {
		return {
			name: this._self?.getName() ?? '',
		};
	}

	public get label() {
		return 'Draft';
	}

	public get contextValue() {
		return ['editable', 'deletable'].join(',');
	}

	static async from(
		patchID: string,
		filePath: string,
		response: GerritCommentResponse
	) {
		return new GerritDraftComment(patchID, filePath, response).init();
	}

	async init() {
		this._self = await GerritUser.getSelf();
		return this;
	}

	static async getForMeta(
		meta: FileMeta
	): Promise<Map<string, GerritDraftComment[]>> {
		const api = getAPI();
		if (!api) {
			return Promise.resolve(new Map());
		}

		return await api.getDraftComments(meta.changeId);
	}
}
