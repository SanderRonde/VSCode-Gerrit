import { Event, Webview, WebviewPanel, WebviewView } from 'vscode';

export interface TypedWebview<M> extends Webview {
	postMessage(message: M): Promise<boolean>;
	onDidReceiveMessage: Event<M>;
}

export interface TypedWebviewPanel<M> extends WebviewPanel {
	webview: TypedWebview<M>;
}

export interface TypedWebviewView<T> extends WebviewView {
	readonly webview: TypedWebview<T>;
}
