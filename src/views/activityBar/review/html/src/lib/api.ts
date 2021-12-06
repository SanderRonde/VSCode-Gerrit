import type { ReviewWebviewMessage } from '../../../messaging';
import { ReviewWebviewState } from '../../../state';

declare const acquireVsCodeApi: () => {
	getState(): ReviewWebviewState;
	setState(data: ReviewWebviewState): void;
	postMessage: (msg: ReviewWebviewMessage) => void;
};

let api: ReturnType<typeof acquireVsCodeApi> | null = null;

export function getAPI(): ReturnType<typeof acquireVsCodeApi> {
	if (api) {
		return api;
	}
	return (api = acquireVsCodeApi());
}
