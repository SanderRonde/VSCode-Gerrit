import { MergeStrategy, SubmitType } from './gerritChangeMergeable';

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
	values: Record<string, string>;
	default_value: number;
}

export type GerritDetailedChangeLabels = Record<
	string,
	GerritDetailedChangeLabel
>;

export type GerritChangeLabels = Record<string, GerritChangeLabel>;

export interface GerritUserResponse {
	_account_id: number;
	_more_accounts?: boolean;
}

export interface GerritDetailedUserResponse extends GerritUserResponse {
	name: string;
	display_name?: string;
	email?: string;
	username?: string;
}

export enum RevisionType {
	REWORK = 'REWORK',
	TRIVIAL_REBASE = 'TRIVIAL_REBASE',
	MERGE_FIRST_PARENT_UPDATE = 'MERGE_FIRST_PARENT_UPDATE',
	NO_CODE_CHANGE = 'NO_CODE_CHANGE',
	NO_CHANGE = 'NO_CHANGE',
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
	_more_changes?: boolean;
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
	author?: GerritDetailedUserResponse;
	patch_set?: number;
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

export type GerritGroupResponse = {
	id: string;
	url: string;
	options: Record<string, unknown>;
	description: string;
	group_id: number;
	owner: string;
	owner_id: string;
	created_on: string;
};

export type GerritGroupBaseInfo = {
	id: string;
	name: string;
};
export type GerritTopicResponse = string | '';

export type GerritGroupsResponse = Record<string, GerritGroupResponse>;

export type GerritProjectResponse = {
	id: string;
	description: string;
};

export type GerritProjectsResponse = Record<string, GerritProjectResponse>;

export type GerritCommentsResponse = Record<string, GerritCommentResponse[]>;

export interface GerritChangeDetailResponse {
	id: string;
	project: string;
	branch: string;
	attention_set: Record<
		string,
		{
			account: GerritDetailedUserResponse;
			last_update: string;
			reason: string;
		}[]
	>;
	change_id: string;
	subject: string;
	status: GerritChangeStatus;
	created: string;
	updated: string;
	mergeable: boolean;
	insertions: number;
	deletions: number;
	_number: number;
	owner: GerritDetailedUserResponse;
	labels: GerritDetailedChangeLabels;
	has_review_started: boolean;
	permitted_labels: Record<string, string[]>;
	removable_reviewers: GerritDetailedUserResponse[];
	reviewers: {
		REVIEWER?: (GerritDetailedUserResponse | GerritGroupBaseInfo)[];
		CC?: (GerritDetailedUserResponse | GerritGroupBaseInfo)[];
	};
	reviewer_updates: {
		state: string;
		reviewer: GerritDetailedUserResponse;
		updated_by: GerritDetailedUserResponse;
		updated: string;
	}[];
	messages: {
		id: string;
		author: GerritDetailedUserResponse;
		date: string;
		message: string;
		_revision_number: number;
	}[];
	topic?: string;
}

export type GerritSuggestedReviewerResponse = (
	| {
			account: GerritDetailedUserResponse;
			count: 1;
	  }
	| {
			group: GerritGroupBaseInfo;
			count: number;
	  }
)[];

export type GerritFilesResponse = Record<string, GerritRevisionFile>;

export interface GerritMergeableInfoResponse {
	submit_type: SubmitType;
	strategy?: MergeStrategy;
	mergeable: boolean;
	commit_merged: boolean;
	content_merged: boolean;
	conflicts?: string[];
	mergeable_into?: string;
}
