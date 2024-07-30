import {
	CancellationToken,
	Disposable,
	EventEmitter,
	ExtensionContext,
	WebviewViewProvider,
	WebviewViewResolveContext,
} from 'vscode';
import {
	CommentUpdateMessage,
	GetPeopleMessage,
	PublishMessage,
	ReviewWebviewMessage,
	SubmitMessage,
} from './review/messaging';
import {
	GerritRepo,
	getRepoFromUri,
	onChangeCurrentRepo,
} from '../../lib/gerrit/gerritRepo';
import {
	ChangeIDWithRepo,
	GerritChange,
} from '../../lib/gerrit/gerritAPI/gerritChange';
import { GerritChangeDetail } from '../../lib/gerrit/gerritAPI/gerritChangeDetail';
import { storageGet, StorageScope, storageSet } from '../../lib/vscode/storage';
import { ChangeState, ReviewPerson, ReviewWebviewState } from './review/state';
import { GerritChangeStatus } from '../../lib/gerrit/gerritAPI/types';
import { GerritGroup } from '../../lib/gerrit/gerritAPI/gerritGroup';
import { GerritUser } from '../../lib/gerrit/gerritAPI/gerritUser';
import { CommentManager } from '../../providers/commentProvider';
import { TypedWebview, TypedWebviewView } from './review/types';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { getAPIForRepo } from '../../lib/gerrit/gerritAPI';
import { getCurrentChange } from '../../lib/git/commit';
import { onChangeLastCommit } from '../../lib/git/git';
import { mappedMax } from '../../lib/util/util';
import { Data } from '../../lib/util/data';
import { getHTML } from './review/html';

export class ReviewWebviewProvider implements WebviewViewProvider, Disposable {
	private readonly _ready: EventEmitter<void> = new EventEmitter<void>();
	private readonly _onReady = new Promise<void>((resolve) => {
		const disposable = this._ready.event(() => {
			disposable.dispose();
			resolve();
		});
	});
	private readonly _views: Set<TypedWebviewView<ReviewWebviewMessage>> =
		new Set();
	private readonly _disposables: Disposable[] = [];
	private _lastState: ReviewWebviewState | null = null;

	public constructor(
		private readonly _gerritReposD: Data<GerritRepo[]>,
		private readonly _context: ExtensionContext
	) {
		this._context.subscriptions.push(
			onChangeCurrentRepo(this._gerritReposD, async () => {
				await this.updateAllStates();
			})
		);

		this._context.subscriptions.push(
			onChangeLastCommit(this._gerritReposD, async () => {
				await this.updateAllStates();
			})
		);
	}

	private async _getChangeMessage(
		change: GerritChange,
		initialState?: Partial<ChangeState>
	): Promise<string> {
		// First look in storage
		const comment = await storageGet(
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
				id: person instanceof GerritUser ? person.accountID : person.id,
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
		return Object.entries(changeDetail.labels)
			.filter(([name]) => changeDetail.permittedLabels[name])
			.map(([name, value]) => {
				return {
					name,
					possibleValues: Object.entries(value.values)
						.filter(([k]) =>
							changeDetail.permittedLabels[name].includes(k)
						)
						.map(([k, v]) => {
							return {
								score: k,
								description: v,
							};
						}),
				};
			});
	}

	private async _getChangeState(
		changeDescriptor: ChangeIDWithRepo,
		initialState?: Partial<ChangeState> | undefined
	): Promise<ChangeState | undefined> {
		const api = await getAPIForRepo(
			this._gerritReposD,
			changeDescriptor.gerritRepo
		);
		if (!api) {
			return undefined;
		}

		const changeSubscription = await GerritChange.getChange(
			this._gerritReposD,
			changeDescriptor,
			[GerritAPIWith.DETAILED_ACCOUNTS, GerritAPIWith.ALL_REVISIONS]
		);
		const draftCommentSubscription = api.getDraftComments(
			changeDescriptor.changeID
		);
		const [change, detail, reviewers, cc, draftComments, self] =
			await Promise.all([
				changeSubscription.getValue(),
				api.getChangeDetail(changeDescriptor.changeID),
				api.suggestReviewers(changeDescriptor.changeID),
				api.suggestCC(changeDescriptor.changeID),
				draftCommentSubscription.getValue(),
				api.getSelf(),
			]);

		[changeSubscription, draftCommentSubscription].map((s) =>
			s.subscribeOnce(
				new WeakRef(async () => {
					await this.updateAllStates();
				})
			)
		);

		if (
			!change ||
			!detail ||
			!reviewers ||
			!cc ||
			!draftComments ||
			!self
		) {
			return undefined;
		}

		let mergeable = false;
		if (change.status === GerritChangeStatus.NEW) {
			mergeable =
				(await api.getChangeMergable(changeDescriptor.changeID))
					?.mergeable ?? false;
		}

		const draftCommentCount = [...draftComments.values()].reduce(
			(p, c) => p + c.length,
			0
		);
		const isOwner = await GerritUser.isSelf(
			this._gerritReposD,
			change.gerritRepo,
			change.owner._account_id
		);
		return {
			number: change.number,
			changeID: change.changeID,
			// If at all possible restore message from previous state. If
			// there is no previous state or it mismatched, look in storage
			// if we can find a match. If we can't find that, just give up and
			// use empty string
			message: await this._getChangeMessage(change, initialState),
			reviewers: detail.reviewers
				.filter(
					(r) =>
						!(r instanceof GerritUser) ||
						r.accountID !== self.accountID
				)
				.map((r) => ({
					id: r instanceof GerritUser ? r.accountID : r.id,
					name: r instanceof GerritUser ? r.getName(true) : r.name,
					shortName: r.shortName(),
					locked: !isOwner,
				})),
			cc: detail.cc.map((r) => ({
				id: r instanceof GerritUser ? r.accountID : r.id,
				name: r instanceof GerritUser ? r.getName(true) : r.name,
				shortName: r.shortName(),
				locked: !isOwner,
			})),
			suggestedReviewers: this._userOrGroupToPeople(reviewers),
			suggestedCC: this._userOrGroupToPeople(cc),
			isOwnWIP: !!change.workInProgress && isOwner,
			isOwn: isOwner,
			draftCommentCount: draftCommentCount,
			labels: this._getLabels(detail),
			isNew: change.status === GerritChangeStatus.NEW,
			fetchedAt:
				change.fetchedAt.timestamp() + detail.fetchedAt.timestamp(),
			mergeable: mergeable,
		};
	}

	private async _getOverriddenChange(): Promise<
		ChangeIDWithRepo | null | undefined
	> {
		const overriddenChangeID = await storageGet(
			'reviewChangeIDOverride',
			StorageScope.WORKSPACE
		);

		if (!overriddenChangeID) {
			return overriddenChangeID;
		}

		if (typeof overriddenChangeID === 'string') {
			// Legacy format
			return null;
		}

		const repo = getRepoFromUri(
			this._gerritReposD.get(),
			overriddenChangeID.repoURI
		);
		if (!repo) {
			return null;
		}

		return {
			changeID: overriddenChangeID.changeID,
			gerritRepo: repo,
		};
	}

	private async _getState(
		initialState?: ReviewWebviewState
	): Promise<ReviewWebviewState> {
		const currentChangeID = await getCurrentChange(
			this._gerritReposD.get(),
			'silent'
		);

		const overriddenChange = await this._getOverriddenChange();
		const retval = {
			...initialState,
			overriddenChange: overriddenChange
				? await this._getChangeState(
						overriddenChange,
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
		const currentChange =
			(await this._getOverriddenChange()) ??
			(await getCurrentChange(this._gerritReposD.get(), 'silent'));
		if (!currentChange) {
			return;
		}
		const api = await getAPIForRepo(
			this._gerritReposD,
			currentChange.gerritRepo
		);
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
		const currentChange =
			(await this._getOverriddenChange()) ??
			(await getCurrentChange(this._gerritReposD.get(), 'silent'));
		if (!currentChange) {
			return;
		}

		const change = await GerritChange.getChangeOnce(
			this._gerritReposD,
			{
				changeID: msg.body.changeID,
				gerritRepo: currentChange.gerritRepo,
			},
			[GerritAPIWith.ALL_REVISIONS]
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

	private async _handlePublishMessage(
		msg: PublishMessage,
		srcView: TypedWebview<ReviewWebviewMessage>
	): Promise<void> {
		const currentChange =
			(await this._getOverriddenChange()) ??
			(await getCurrentChange(this._gerritReposD.get(), 'silent'));
		if (!currentChange) {
			return;
		}

		const api = await getAPIForRepo(
			this._gerritReposD,
			currentChange.gerritRepo
		);
		if (!api) {
			await srcView.postMessage({
				type: 'publishFailed',
			});
			return;
		}

		const subscription = await GerritChange.getChange(this._gerritReposD, {
			changeID: msg.body.changeID,
			gerritRepo: currentChange.gerritRepo,
		});
		const change = await subscription.getValue();
		if (!change) {
			await srcView.postMessage({
				type: 'publishFailed',
			});
			return;
		}

		const currentRevision = await change.currentRevision();
		if (!currentRevision) {
			await srcView.postMessage({
				type: 'publishFailed',
			});
			return;
		}

		const setReviewSuccess = await api.setReview(
			change.changeID,
			currentRevision.id,
			{
				resolved: msg.body.resolved,
				message: msg.body.message || undefined,
				labels: msg.body.labels,
				cc: msg.body.cc,
				reviewers: msg.body.reviewers,
				publishDrafts: msg.body.publishDrafts,
			}
		);
		if (setReviewSuccess) {
			await storageSet('reviewComment', null, StorageScope.WORKSPACE);
			await srcView.postMessage({
				type: 'publishSuccess',
			});
			CommentManager.getFileManagersForChangeID(change.changeID).forEach(
				(manager) => void manager.refreshComments()
			);
			await subscription.invalidate();
		} else {
			await srcView.postMessage({
				type: 'publishFailed',
			});
		}
	}

	private async _handleSubmitMessage(
		msg: SubmitMessage,
		srcView: TypedWebview<ReviewWebviewMessage>
	): Promise<void> {
		const currentChange =
			(await this._getOverriddenChange()) ??
			(await getCurrentChange(this._gerritReposD.get(), 'silent'));
		if (!currentChange) {
			return;
		}

		const api = await getAPIForRepo(
			this._gerritReposD,
			currentChange.gerritRepo
		);
		if (!api) {
			await srcView.postMessage({
				type: 'publishFailed',
			});
			return;
		}

		const setReviewSuccess = await api.submit(msg.body.changeID);
		if (setReviewSuccess) {
			await srcView.postMessage({
				type: 'publishSuccess',
			});
		} else {
			await srcView.postMessage({
				type: 'publishFailed',
			});
		}
	}

	private async _handleMessage(
		msg: ReviewWebviewMessage,
		srcView: TypedWebview<ReviewWebviewMessage>
	): Promise<void> {
		if (msg.type === 'ready') {
			this._ready.fire();
			return;
		} else if (msg.type === 'backToCurrent') {
			await storageSet(
				'reviewChangeIDOverride',
				null,
				StorageScope.WORKSPACE
			);
			await this.updateAllStates();
		} else if (msg.type === 'getPeople') {
			await this._handleGetPeopleMessage(msg);
		} else if (msg.type === 'commentUpdate') {
			await this._handleCommentUpdateMessage(msg);
		} else if (msg.type === 'publish') {
			await this._handlePublishMessage(msg, srcView);
		} else if (msg.type === 'submit') {
			await this._handleSubmitMessage(msg, srcView);
		}
	}

	private async _initWebviewWithState(
		webviewView: TypedWebviewView<ReviewWebviewMessage>,
		state: ReviewWebviewState
	): Promise<void> {
		await webviewView.webview.postMessage({
			type: 'stateToView',
			body: {
				state: state,
			},
		});
		await webviewView.webview.postMessage({ type: 'initialize' });
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

	public async revealAllStates(): Promise<void> {
		if (this._views.size === 0) {
			return;
		}
		await Promise.all([...this._views.values()].map((v) => v.show()));
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
		this._disposables.push({
			dispose: () => this._views.delete(webviewView),
		});
		this._context.subscriptions.push(
			webviewView.onDidDispose(() => this.dispose())
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
			webviewView.webview.onDidReceiveMessage((msg) =>
				this._handleMessage(msg, webviewView.webview)
			)
		);

		await this._onReady;
		if (token.isCancellationRequested) {
			return;
		}

		const state = await this._getState(context.state);
		await this._initWebviewWithState(webviewView, state);
		this._disposables.push(
			this._ready.event(async () => {
				await this._initWebviewWithState(
					webviewView,
					this._lastState ?? state
				);
			})
		);
	}

	public dispose(): void {
		this._disposables.forEach((d) => void d.dispose());
	}
}
