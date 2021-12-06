import {
	CancellationToken,
	EventEmitter,
	ExtensionContext,
	WebviewViewProvider,
	WebviewViewResolveContext,
} from 'vscode';
import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { ReviewWebviewMessage } from './review/messaging';
import { getCurrentChangeID } from '../../lib/git/commit';
import { onChangeLastCommit } from '../../lib/git/git';
import { ReviewWebviewState } from './review/state';
import { TypedWebviewView } from './review/types';
import { getHTML } from './review/html';

export class ReviewWebviewProvider implements WebviewViewProvider {
	private _ready: EventEmitter<void> = new EventEmitter<void>();
	private _onReady = new Promise<void>((resolve) => {
		const disposable = this._ready.event(() => {
			disposable.dispose();
			resolve();
		});
	});
	private _views: Set<TypedWebviewView<ReviewWebviewMessage>> = new Set();

	public constructor(private readonly _context: ExtensionContext) {}

	private async _init(): Promise<void> {
		this._context.subscriptions.push(
			await onChangeLastCommit(async () => {
				await this._updateAllStates();
			}, true)
		);
	}

	private async _updateAllStates(): Promise<void> {
		const state = await this._getState();
		await Promise.all(
			[...this._views.values()].map((v) =>
				v.webview.postMessage({
					type: 'stateToView',
					body: {
						state,
					},
				})
			)
		);
	}

	private async _getState(
		initialState?: ReviewWebviewState
	): Promise<ReviewWebviewState> {
		const changeID = await getCurrentChangeID();
		if (!changeID) {
			return {
				...initialState,
				currentChange: undefined,
			};
		}

		const change = await GerritChange.getChangeCached(
			changeID,
			GerritAPIWith.DETAILED_ACCOUNTS
		);
		if (!change) {
			return {
				...initialState,
				currentChange: undefined,
			};
		}

		// TODO: craft state :)
	}

	public async resolveWebviewView(
		webviewView: TypedWebviewView<ReviewWebviewMessage>,
		context: WebviewViewResolveContext<ReviewWebviewState>,
		token: CancellationToken
	): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}

		this._views.add(webviewView);
		this._context.subscriptions.push(
			webviewView.onDidDispose(() => this._views.delete(webviewView))
		);

		webviewView.webview.options = {
			...webviewView.webview.options,
			enableScripts: true,
			localResourceRoots: [this._context.extensionUri],
		};
		webviewView.webview.html = getHTML(
			this._context.extensionUri,
			webviewView.webview
		);

		this._context.subscriptions.push(
			webviewView.webview.onDidReceiveMessage((msg) => {
				if (msg.type === 'ready') {
					this._ready.fire();
					return;
				}

				// TODO:
				console.log(msg);
			})
		);

		await this._onReady;
		if (token.isCancellationRequested) {
			return;
		}

		await webviewView.webview.postMessage({
			type: 'stateToView',
			body: {
				state: context.state || {},
			},
		});
		if (token.isCancellationRequested) {
			return;
		}
		await webviewView.webview.postMessage({ type: 'initialize' });
	}
}
