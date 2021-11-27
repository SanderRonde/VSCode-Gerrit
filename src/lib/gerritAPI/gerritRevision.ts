import {
	FetchInstructions,
	GerritDetailedUserResponse,
	GerritRevisionResponse,
	GerritUserResponse,
	RevisionType,
} from './types';
import { DynamicallyFetchable } from './shared';
import { GerritCommit } from './gerritCommit';
import { GerritChange } from './gerritChange';
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

	public files(
		...additionalWith: GerritAPIWith[]
	): Promise<Record<string, GerritFile> | null> {
		return this._fieldFallbackGetter(
			'_files',
			[
				GerritAPIWith.CURRENT_REVISION,
				GerritAPIWith.CURRENT_FILES,
				...additionalWith,
			],
			async (c) => (await c.getCurrentRevision())?.files() ?? null
		);
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

	public constructor(
		protected _patchID: string,
		public change: GerritChange,
		public currentRevision: string,
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
				this._patchID,
				this.currentRevision,
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
								this._patchID,
								this.change,
								this.currentRevision,
								k,
								v
							),
						] as [string, GerritFile]
				)
			);
		}
	}
}
