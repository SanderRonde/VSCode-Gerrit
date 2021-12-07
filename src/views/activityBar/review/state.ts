export interface ChangeState {
	number: number;
	changeID: string;
	message: string;
	reviewers: ReviewPerson[];
	cc: ReviewPerson[];
	suggestedReviewers?: ReviewPerson[];
	suggestedCC?: ReviewPerson[];
	isOwnWIP: boolean;
	draftCommentCount: number;
	labels: {
		possibleValues: {
			score: string;
			description: string;
		}[];
		name: string;
	}[];
	isNew: boolean;
}

export interface ReviewPerson {
	id: string;
	name: string;
	shortName: string;
}

export type DeepPartial<T> = {
	[P in keyof T]?: DeepPartial<T[P]>;
};

export type ReviewWebviewState = {
	currentChange?: ChangeState;
	overriddenChange?: ChangeState;
};
