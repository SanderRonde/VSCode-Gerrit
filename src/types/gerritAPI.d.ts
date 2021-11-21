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
	owner: GerritUser | GerritDetailedUser;
}
