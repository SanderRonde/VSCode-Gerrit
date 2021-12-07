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
		labels: Record<string, number>;
		publishDrafts: boolean;
		reviewers: string[];
		cc: string[];
		// TODO: this msg
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
	| PublishMessage;
