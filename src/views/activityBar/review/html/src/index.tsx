import { initMessageHandler, sendMessage } from './lib/messageHandler';
import { registerComponents } from './lib/components';

((): void => {
	registerComponents();
	initMessageHandler();
	sendMessage({
		type: 'ready',
	});
})();
