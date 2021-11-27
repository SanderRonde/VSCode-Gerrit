import { OutputChannel, window } from 'vscode';
import { IS_DEV } from './constants';

let channel: OutputChannel | null;

export function createOutputChannel(): void {
	channel = window.createOutputChannel('Gerrit');
}

export function log(...data: string[]): void {
	if (channel) {
		channel.appendLine(data.join(' '));
	}
	if (IS_DEV) {
		console.log('LOG:', ...data);
	}
}
