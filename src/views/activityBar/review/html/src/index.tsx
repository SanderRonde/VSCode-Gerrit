import { initMessageHandler, sendMessage } from './lib/messageHandler';

((): void => {
	initMessageHandler();
	sendMessage({
		type: 'ready',
	});
})();
