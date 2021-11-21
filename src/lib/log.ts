import { OutputChannel, window } from 'vscode';
import { IS_DEV } from './constants';

let channel: OutputChannel | null;

export function createOutputChannel() {
	channel = window.createOutputChannel('Gerrit');
}

export function log(...data: string[]) {
	if (channel) {
		channel.appendLine(data.join(' '));
	}
	if (IS_DEV) {
		console.log('LOG:', ...data);
	}
}
