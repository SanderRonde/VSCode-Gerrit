import { OutputChannel, window } from 'vscode';
import { isDev } from './dev';

let channel: OutputChannel | null;

export function createOutputChannel(): void {
	channel = window.createOutputChannel('Gerrit');
}

export function logDev(...data: unknown[]): void {
	if (isDev()) {
		console.log('DEV:', ...data);
	}
}

export function log(...data: string[]): void {
	if (channel) {
		channel.appendLine(data.join(' '));
	}
	logDev('LOG:', ...data);
}
