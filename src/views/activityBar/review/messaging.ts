import { ReviewWebviewState } from './state';

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
	  };
