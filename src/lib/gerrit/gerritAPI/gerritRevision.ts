import {
	FetchInstructions,
	GerritDetailedUserResponse,
	GerritRevisionResponse,
	GerritUserResponse,
	RevisionType,
} from './types';
import { PatchsetDescription } from '../../../views/activityBar/changes/changeTreeView';
import { ChangeField } from '../../subscriptions/changeSubscription';
import { Subscribable } from '../../subscriptions/subscriptions';
import { getAPIForSubscription } from '../gerritAPI';
import { DynamicallyFetchable } from './shared';
import { GerritCommit } from './gerritCommit';
import { GerritRepo } from '../gerritRepo';
import { GerritFile } from './gerritFile';
import { Data } from '../../util/data';
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
		public override gerritReposD: Data<GerritRepo[]>,
		public override gerritRepo: GerritRepo,
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
				this.gerritReposD,
				this.gerritRepo,
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
								this.gerritReposD,
								this.gerritRepo,
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
		const api = await getAPIForSubscription(
			this.gerritReposD,
			this.gerritRepo
		);

		if (baseRevision === null && this.isCurrentRevision) {
			const subscription =
				api.subscriptionManager.filesSubscriptions.createFetcher(
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
