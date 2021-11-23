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

export interface GerritUser {
	_account_id: number;
}

export interface GerritDetailedUser extends GerritUser {
	name: string;
	display_name?: string;
	email?: string;
	username?: string;
}

export enum RevisionType {
	REWORK = 'REWORK',
}

interface FetchInstructions {
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

export interface GerritRevisionResponse {
	kind: RevisionType;
	_number: number;
	created: string;
	uploader: GerritUser | GerritDetailedUser;
	ref: string;
	fetch: {
		ssh: FetchInstructions;
		http: FetchInstructions;
	};
	files?: Record<string, GerritRevisionFile>;
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
	owner: GerritUser | GerritDetailedUser;
}
