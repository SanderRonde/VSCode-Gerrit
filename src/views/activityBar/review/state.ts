export interface ChangeState {
	number: number;
	changeID: string;
	message: string;
	reviewers: ReviewPerson[];
	cc: ReviewPerson[];
	suggestedReviewers?: ReviewPerson[];
	suggestedCC?: ReviewPerson[];
	isOwnWIP: boolean;
	isOwn: boolean;
	draftCommentCount: number;
	labels: {
		possibleValues: {
			score: string;
			description: string;
		}[];
		name: string;
	}[];
	isNew: boolean;
	fetchedAt: number;
	mergeable: boolean;
}

export interface ReviewPerson {
	id: string | number;
	name: string;
	shortName: string;
	locked?: boolean;
}

export type DeepPartial<T> = {
	[P in keyof T]?: DeepPartial<T[P]>;
};

export type ReviewWebviewState = {
	currentChange?: ChangeState;
	overriddenChange?: ChangeState;
};
