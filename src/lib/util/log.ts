import { OutputChannel, window } from 'vscode';
import { isDev } from './dev';

let channel: OutputChannel | null;

export function createOutputChannel(): void {
	channel = window.createOutputChannel('Gerrit');
}

export function logDev(...data: string[]): void {
	if (channel) {
		channel.appendLine(data.join(' '));
	}
	console.log('LOG:', ...data);
}

export function log(...data: string[]): void {
	if (channel) {
		channel.appendLine(data.join(' '));
	}
	if (isDev()) {
		console.log('LOG:', ...data);
	}
}
