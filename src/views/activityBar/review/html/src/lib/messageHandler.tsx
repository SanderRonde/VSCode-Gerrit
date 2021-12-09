import type { ReviewWebviewMessage } from '../../../messaging';
import { getAPI } from './api';

export const messageListeners: Set<(msg: ReviewWebviewMessage) => void> =
	new Set();
export function initMessageHandler(): void {
	window.addEventListener(
		'message',
		(message: MessageEvent<ReviewWebviewMessage>) => {
			if (message.data.type === 'stateToView') {
				const { state } = message.data.body;
				getAPI().setState(state);
			}

			messageListeners.forEach((l) => l(message.data));
		}
	);
}

export function sendMessage(message: ReviewWebviewMessage): void {
	const api = getAPI();
	api.postMessage(message);
}
