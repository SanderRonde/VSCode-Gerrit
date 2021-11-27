export enum GerritChangeStatus {
	NEW = 'NEW',
	MERGED = 'MERGED',
	ABANDONED = 'ABANDONED',
}

interface GerritChangeLabel {
	approved?: { _account_id: number };
	optional?: boolean;
	rejected?: { _account_id: number };
	blocking?: boolean;
}

export interface GerritDetailedChangeLabel extends GerritChangeLabel {
	all: {
		_account_id: number;
		value?: number;
		date?: string;
		permitted_voting_range: {
			min: number;
			max: number;
		};
	}[];
	values: Record<number, string>;
	default_value: number;
}

export type GerritDetailedChangeLabels = Record<
	string,
	GerritDetailedChangeLabel
>;

export type GerritChangeLabels = Record<string, GerritChangeLabel>;

export interface GerritUserResponse {
	_account_id: number;
}

export interface GerritDetailedUserResponse extends GerritUserResponse {
	name: string;
	display_name?: string;
	email?: string;
	username?: string;
}

export enum RevisionType {
	REWORK = 'REWORK',
}

export interface FetchInstructions {
	url: string;
	ref: string;
}

export enum GerritRevisionFileStatus {
	ADDED = 'A',
	RENAMED = 'R',
	DELETED = 'D',
}

interface GerritRevisionBaseFile {
	lines_inserted: number;
	lines_deleted: number;
	size_delta: number;
	size: number;
}

export type GerritRevisionFile =
	| (GerritRevisionBaseFile & {
			status?:
				| GerritRevisionFileStatus.ADDED
				| GerritRevisionFileStatus.DELETED;
			old_path: undefined;
	  })
	| (GerritRevisionBaseFile & {
			status: GerritRevisionFileStatus.RENAMED;
			old_path: string;
	  });

export interface GerritAuthor {
	name: string;
	email: string;
	date: string;
	tz: number;
}

export interface GerritCommitResponse {
	parents: { commit: string; subject: string }[];
	author: GerritAuthor;
	committer: GerritAuthor;
	subject: string;
	message: string;
}

export interface GerritRevisionResponse {
	kind: RevisionType;
	_number: number;
	created: string;
	uploader: GerritUserResponse | GerritDetailedUserResponse;
	ref: string;
	fetch: {
		ssh: FetchInstructions;
		http: FetchInstructions;
	};
	files?: Record<string, GerritRevisionFile>;
	commit?: GerritCommitResponse;
}

export type GerritRevisions = Record<string, GerritRevisionResponse>;

export interface GerritChangeResponse {
	id: string;
	project: string;
	branch: string;
	change_id: string;
	subject: string;
	status: GerritChangeStatus;
	created: string;
	updated: string;
	mergeable: boolean;
	insertions: number;
	deletions: number;
	_number: number;
	work_in_progress?: boolean;
	labels?: GerritChangeLabels | GerritDetailedChangeLabels;
	current_revision?: string;
	revisions?: GerritRevisions;
	owner: GerritUserResponse | GerritDetailedUserResponse;
}

export enum GerritCommentSide {
	RIGHT = 'REVISION',
	LEFT = 'PARENT',
}

export interface GerritCommentRange {
	start_line: number;
	start_character: number;
	end_line: number;
	end_character: number;
}

export type GerritCommentResponse = {
	id: string;
	author: GerritDetailedUserResponse;
	patch_set?: string;
	commit_id: string;
	path?: string;
	side?: GerritCommentSide;
	parent?: number;
	line?: number;
	range?: GerritCommentRange;
	in_reply_to?: string;
	message?: string;
	updated: string;
	tag?: string;
	unresolved?: boolean;
	change_message_id: string;
	context_lines?: {
		line_number: number;
		context_line: string;
	}[];
	source_content_type?: string;
};

export type GerritCommentsResponse = Record<string, GerritCommentResponse[]>;
