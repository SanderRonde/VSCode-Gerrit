import { initMessageHandler, sendMessage } from './lib/messageHandler';
import { registerComponents } from './lib/components';
import * as ReactDOM from 'react-dom';
import { Root } from './ui/PaneRoot';
import * as React from 'react';

((): void => {
	registerComponents();
	initMessageHandler();
	sendMessage({
		type: 'ready',
	});

	ReactDOM.render(<Root />, document.getElementById('app'));
})();
