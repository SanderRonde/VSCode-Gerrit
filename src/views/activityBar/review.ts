import {
	CancellationToken,
	EventEmitter,
	ExtensionContext,
	WebviewViewProvider,
	WebviewViewResolveContext,
} from 'vscode';
import {
	CommentUpdateMessage,
	GetPeopleMessage,
	ReviewWebviewMessage,
} from './review/messaging';
import { GerritChangeDetail } from '../../lib/gerrit/gerritAPI/gerritChangeDetail';
import { storageGet, StorageScope, storageSet } from '../../lib/vscode/storage';
import { ChangeState, ReviewPerson, ReviewWebviewState } from './review/state';
import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { GerritChangeStatus } from '../../lib/gerrit/gerritAPI/types';
import { GerritGroup } from '../../lib/gerrit/gerritAPI/gerritGroup';
import { GerritUser } from '../../lib/gerrit/gerritAPI/gerritUser';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { getCurrentChangeID } from '../../lib/git/commit';
import { onChangeLastCommit } from '../../lib/git/git';
import { getAPI } from '../../lib/gerrit/gerritAPI';
import { TypedWebviewView } from './review/types';
import { mappedMax } from '../../lib/util/util';
import { getHTML } from './review/html';

class ReviewWebviewProvider implements WebviewViewProvider {
	private _ready: EventEmitter<void> = new EventEmitter<void>();
	private _onReady = new Promise<void>((resolve) => {
		const disposable = this._ready.event(() => {
			disposable.dispose();
			resolve();
		});
	});
	private _views: Set<TypedWebviewView<ReviewWebviewMessage>> = new Set();
	private _lastState: ReviewWebviewState | null = null;

	private constructor(private readonly _context: ExtensionContext) {}

	public static async create(
		context: ExtensionContext
	): Promise<ReviewWebviewProvider> {
		return await new this(context).init();
	}

	private async _getChangeMessage(
		change: GerritChange,
		initialState?: Partial<ChangeState>
	): Promise<string> {
		// First look in storaeg
		const comment = storageGet(
			this._context,
			'reviewComment',
			StorageScope.WORKSPACE
		);
		if (
			!comment ||
			comment.project !== change.project ||
			comment.changeID !== change.changeID
		) {
			return '';
		}

		const revisions = await change.revisions();
		if (!revisions || Object.values(revisions).length === 0) {
			return '';
		}

		const lastRevision = mappedMax(
			Object.values(revisions),
			(revision) => revision.number
		);

		if (comment.patchSet === lastRevision.number) {
			return comment.comment;
		}

		// Then in previous state
		if (
			initialState?.number &&
			initialState.number === change.number &&
			initialState.message
		) {
			return initialState.message;
		}

		return '';
	}

	private _userOrGroupToPeople(
		value: (GerritUser | GerritGroup)[]
	): ReviewPerson[] {
		return value
			.map((person) => ({
				id: person instanceof GerritUser ? person.username : person.id,
				name:
					person instanceof GerritUser
						? person.getName(true)
						: person.name,
				shortName: person.shortName(),
			}))
			.filter((p) => !!p.id) as {
			id: string;
			name: string;
			shortName: string;
		}[];
	}

	private _getLabels(
		changeDetail: GerritChangeDetail
	): ChangeState['labels'] {
		return Object.entries(changeDetail.labels).map(([name, value]) => {
			return {
				name,
				possibleValues: Object.entries(value.values).map(([k, v]) => {
					return {
						score: k,
						description: v,
					};
				}),
			};
		});
	}

	private async _getChangeState(
		changeID: string,
		initialState?: Partial<ChangeState> | undefined
	): Promise<ChangeState | undefined> {
		const api = await getAPI();
		if (!api) {
			return undefined;
		}

		// TODO: join these requests
		const [change, detail, reviewers, cc, draftComments] =
			await Promise.all([
				GerritChange.getChangeCached(
					changeID,
					GerritAPIWith.DETAILED_ACCOUNTS,
					GerritAPIWith.ALL_REVISIONS
				),
				api.getChangeDetail(changeID),
				api.suggestReviewers(changeID),
				api.suggestCC(changeID),
				api.getDraftComments(changeID),
			]);
		if (!change || !detail || !reviewers || !cc || !draftComments) {
			return undefined;
		}

		const draftCommentCount = [...draftComments.values()].reduce(
			(p, c) => p + c.length,
			0
		);
		return {
			number: change.number,
			changeID: change.changeID,
			// If at all possible restore message from previous state. If
			// there is no previous state or it mismatched, look in storage
			// if we can find a match. If we can't find that, just give up and
			// use empty string
			message: await this._getChangeMessage(change, initialState),
			reviewers: detail.reviewers.map((r) => ({
				id: r.username ?? '?',
				name: r.getName() ?? '?',
				shortName: r.shortName(),
			})),
			cc: detail.cc.map((r) => ({
				id: r.username ?? '?',
				name: r.getName() ?? '?',
				shortName: r.shortName(),
			})),
			suggestedReviewers: this._userOrGroupToPeople(reviewers),
			suggestedCC: this._userOrGroupToPeople(cc),
			isOwnWIP:
				!!change.workInProgress &&
				(await GerritUser.isSelf(change.owner._account_id)),
			draftCommentCount: draftCommentCount,
			labels: this._getLabels(detail),
			isNew: change.status === GerritChangeStatus.NEW,
		};
	}

	private async _getState(
		initialState?: ReviewWebviewState
	): Promise<ReviewWebviewState> {
		const currentChangeID = await getCurrentChangeID();
		const overriddenChangeID = storageGet(
			this._context,
			'reviewChangeIDOverride',
			StorageScope.WORKSPACE
		);

		const retval = {
			...initialState,
			overriddenChange: overriddenChangeID
				? await this._getChangeState(
						overriddenChangeID,
						initialState?.overriddenChange
				  )
				: undefined,
			currentChange: currentChangeID
				? await this._getChangeState(
						currentChangeID,
						initialState?.currentChange
				  )
				: undefined,
		};
		this._lastState = retval;
		return retval;
	}

	private async _handleGetPeopleMessage(
		msg: GetPeopleMessage
	): Promise<void> {
		const api = await getAPI();
		if (!api) {
			return;
		}
		const fn = msg.body.isCC
			? api.suggestCC.bind(api)
			: api.suggestReviewers.bind(api);
		const people = await fn(msg.body.changeID, msg.body.query);

		const stateCopy = { ...this._lastState };
		const prop = msg.body.isCC ? 'suggestedCC' : 'suggestedReviewers';
		const change =
			stateCopy.currentChange &&
			stateCopy.currentChange.changeID === msg.body.changeID
				? 'currentChange'
				: 'overriddenChange';
		stateCopy[change]![prop] = this._userOrGroupToPeople(people);
		await this.updateAllStates(stateCopy);
	}

	private async _handleCommentUpdateMessage(
		msg: CommentUpdateMessage
	): Promise<void> {
		const change = await GerritChange.getChangeCached(
			msg.body.changeID,
			GerritAPIWith.ALL_REVISIONS
		);
		if (!change) {
			return;
		}

		const revisions = await change.revisions();
		if (!revisions) {
			return;
		}

		const lastRevision = mappedMax(
			Object.values(revisions),
			(revision) => revision.number
		);
		await storageSet(
			this._context,
			'reviewComment',
			{
				comment: msg.body.text,
				changeID: msg.body.changeID,
				project: change.project,
				patchSet: lastRevision.number,
				setAt: new Date().getTime(),
			},
			StorageScope.WORKSPACE
		);
	}

	private async _handleMessage(msg: ReviewWebviewMessage): Promise<void> {
		if (msg.type === 'ready') {
			this._ready.fire();
			return;
		} else if (msg.type === 'backToCurrent') {
			await storageSet(
				this._context,
				'reviewChangeIDOverride',
				null,
				StorageScope.WORKSPACE
			);
			await this.updateAllStates();
		} else if (msg.type === 'getPeople') {
			await this._handleGetPeopleMessage(msg);
		} else if (msg.type === 'commentUpdate') {
			await this._handleCommentUpdateMessage(msg);
		}
	}

	public async updateAllStates(newState?: ReviewWebviewState): Promise<void> {
		if (this._views.size === 0) {
			return;
		}
		const state =
			newState ?? (await this._getState(this._lastState ?? undefined));
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

	public async init(): Promise<this> {
		this._context.subscriptions.push(
			await onChangeLastCommit(async () => {
				await this.updateAllStates();
			}, true)
		);
		return this;
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
			webviewView.webview.onDidReceiveMessage(
				this._handleMessage.bind(this)
			)
		);

		await this._onReady;
		if (token.isCancellationRequested) {
			return;
		}

		await webviewView.webview.postMessage({
			type: 'stateToView',
			body: {
				state: await this._getState(context.state),
			},
		});
		if (token.isCancellationRequested) {
			return;
		}
		await webviewView.webview.postMessage({ type: 'initialize' });
	}
}

let reviewWebviewProvider: ReviewWebviewProvider | null = null;
export async function getOrCreateReviewWebviewProvider(
	context: ExtensionContext
): Promise<ReviewWebviewProvider> {
	if (reviewWebviewProvider) {
		return reviewWebviewProvider;
	}
	return (reviewWebviewProvider = await ReviewWebviewProvider.create(
		context
	));
}

export function getReviewWebviewProvider(): ReviewWebviewProvider | null {
	return reviewWebviewProvider;
}
