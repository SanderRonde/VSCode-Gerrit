import {
	FetchInstructions,
	GerritDetailedUserResponse,
	GerritRevisionResponse,
	GerritUserResponse,
	RevisionType,
} from './types';
import { PatchsetDescription } from '../../../views/activityBar/changes/changeTreeView';
import { DynamicallyFetchable } from './shared';
import { GerritCommit } from './gerritCommit';
import { GerritChange } from './gerritChange';
import { GerritFile } from './gerritFile';
import { GerritAPIWith } from './api';
import { getAPI } from '../gerritAPI';

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
		public change: GerritChange,
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
								this.change,
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
	): Promise<Record<string, GerritFile> | null> {
		if (baseRevision === null && this.isCurrentRevision) {
			return this._fieldFallbackGetter(
				'_files',
				[
					GerritAPIWith.CURRENT_REVISION,
					GerritAPIWith.CURRENT_FILES,
					...additionalWith,
				],
				async (c) => (await c.getCurrentRevision())?.files() ?? null
			);
		} else {
			const api = await getAPI();
			if (!api) {
				return null;
			}

			const files = await api.getFiles(
				this.change,
				{
					id: this.revisionID,
					number: this.number,
				},
				baseRevision ?? undefined
			);
			if (!files) {
				return null;
			}
			return Object.fromEntries(files.map((f) => [f.filePath, f]));
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
