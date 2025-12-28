import {
	FetchInstructions,
	GerritDetailedUserResponse,
	GerritRevisionResponse,
	GerritUserResponse,
	RevisionType,
} from './types';
import {
	APISubscriptionManager,
	Subscribable,
} from '../../subscriptions/subscriptions';
import { PatchsetDescription } from '../../../views/activityBar/changes/changeTreeView';
import { ChangeField } from '../../subscriptions/changeSubscription';
import { getAPIForSubscription } from '../gerritAPI';
import { DynamicallyFetchable } from './shared';
import { GerritCommit } from './gerritCommit';
import { GerritFile } from './gerritFile';
import { GerritAPIWith } from './api';

export class GerritRevision extends DynamicallyFetchable {
	public kind: RevisionType;
	public number: number;
	public created: string;
	public uploader: GerritUserResponse;
	public ref: string;
	public fetch: {
		ssh: FetchInstructions;
		http: FetchInstructions;
	};

	public _files: Record<string, GerritFile> | null = null;
	public _detailedUploader: GerritDetailedUserResponse | null = null;
	public _commit: GerritCommit | null = null;

	public constructor(
		public override changeID: string,
		private readonly _changeProject: string,
		public revisionID: string,
		public isCurrentRevision: boolean,
		response: GerritRevisionResponse
	) {
		super();
		this.kind = response.kind;
		this.number = response._number;
		this.created = response.created;
		this.ref = response.ref;
		this.fetch = response.fetch;
		this.uploader = response.uploader;

		if (
			'display_name' in response.uploader ||
			'email' in response.uploader ||
			'username' in response.uploader ||
			'name' in response.uploader
		) {
			this._detailedUploader = response.uploader;
		}

		if (response.commit) {
			this._commit = new GerritCommit(
				this.changeID,
				this.revisionID,
				response.commit
			);
		}

		if (response.files) {
			this._files = Object.fromEntries(
				Object.entries(response.files).map(
					([k, v]) =>
						[
							k,
							new GerritFile(
								this.changeID,
								this._changeProject,
								{
									id: this.revisionID,
									number: this.number,
								},
								k,
								v
							),
						] as [string, GerritFile]
				)
			);
		}
	}

	public async files(
		baseRevision: PatchsetDescription | null = null,
		...additionalWith: GerritAPIWith[]
	): Promise<Subscribable<Record<string, GerritFile>>> {
		const api = await getAPIForSubscription();

		if (baseRevision === null && this.isCurrentRevision) {
			const subscription =
				APISubscriptionManager.filesSubscriptions.createFetcher(
					{
						changeID: this.changeID,
						revision: {
							id: this.revisionID,
							number: this.number,
						},
						baseRevision: baseRevision,
					},
					async () => {
						const changeSubscription = api.getChange(
							this.changeID,
							ChangeField.FILES,
							[
								GerritAPIWith.CURRENT_REVISION,
								GerritAPIWith.CURRENT_FILES,
								...additionalWith,
							]
						);
						const change = await changeSubscription.getValue();
						changeSubscription.subscribeOnce(
							new WeakRef(subscription.invalidate)
						);
						if (!change) {
							return {};
						}
						return (
							(await change.getCurrentRevision())?._files ?? {}
						);
					}
				);
			return subscription;
		} else {
			return api.getFiles(
				this.changeID,
				this._changeProject,
				{
					id: this.revisionID,
					number: this.number,
				},
				baseRevision ?? undefined
			);
		}
	}

	public async setFileReviewed(
		path: string,
		reviewed: boolean
	): Promise<void> {
		const api = await getAPIForSubscription();
		await api.setFileReviewed(
			this.changeID,
			{
				id: this.revisionID,
				number: this.number,
			},
			path,
			reviewed
		);
	}

	public async getFileReviewStatus(): Promise<
		Subscribable<Record<string, boolean>>
	> {
		const api = await getAPIForSubscription();
		return api.getFileReviewStatus(this.changeID, {
			id: this.revisionID,
			number: this.number,
		});
	}

	public detailedUploader(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritDetailedUserResponse | null> {
		return this._fieldFallbackGetter(
			'_detailedUploader',
			[
				GerritAPIWith.DETAILED_ACCOUNTS,
				GerritAPIWith.CURRENT_REVISION,
				...additionalWith,
			],
			async (c) =>
				(await c.getCurrentRevision())?.detailedUploader() ?? null
		);
	}

	public commit(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritCommit | null> {
		return this._fieldFallbackGetter(
			'_commit',
			[
				GerritAPIWith.CURRENT_REVISION,
				GerritAPIWith.CURRENT_COMMIT,
				...additionalWith,
			],
			async (c) => (await c.getCurrentRevision())?.commit() ?? null
		);
	}
}
