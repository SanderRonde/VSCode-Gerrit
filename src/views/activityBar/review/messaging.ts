import { ReviewWebviewState } from './state';

export interface GetPeopleMessage {
	type: 'getPeople';
	body: {
		changeID: string;
		query?: string;
		isCC: boolean;
	};
}

export interface CommentUpdateMessage {
	type: 'commentUpdate';
	body: {
		changeID: string;
		text: string;
	};
}

export interface PublishMessage {
	type: 'publish';
	body: {
		changeID: string;
		resolved: boolean;
		message?: string;
		labels: Record<string, number>;
		publishDrafts: boolean;
		reviewers: (number | string)[];
		cc: (number | string)[];
	};
}

export interface SubmitMessage {
	type: 'submit';
	body: {
		changeID: string;
	};
}

/**
 * Review `postMessage` message types and their bodies.
 */
export type ReviewWebviewMessage =
	| {
			type: 'stateToView';
			body: {
				state: ReviewWebviewState;
			};
	  }
	| {
			type: 'stateToController';
			body: {
				state: ReviewWebviewState;
			};
	  }
	| {
			type: 'initialize';
	  }
	| {
			type: 'ready';
	  }
	| {
			type: 'backToCurrent';
	  }
	| GetPeopleMessage
	| CommentUpdateMessage
	| PublishMessage
	| {
			type: 'publishFailed';
	  }
	| {
			type: 'publishSuccess';
	  }
	| SubmitMessage;
