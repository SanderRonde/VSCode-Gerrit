import {
	FetchInstructions,
	GerritDetailedUser,
	GerritRevisionResponse,
	GerritUser,
	RevisionType,
} from '../../types/gerritAPI';
import { DynamicallyFetchable } from './shared';
import { GerritFile } from './gerritFile';
import { GerritAPIWith } from './api';

export class GerritRevision extends DynamicallyFetchable {
	public kind: RevisionType;
	public number: number;
	public created: string;
	public uploader: GerritUser;
	public ref: string;
	public fetch: {
		ssh: FetchInstructions;
		http: FetchInstructions;
	};

	public _files: Record<string, GerritFile> | null = null;
	public _detailedUploader: GerritDetailedUser | null = null;

	public get files(): Promise<Record<string, GerritFile> | null> {
		return this._fieldFallbackGetter(
			'_files',
			[GerritAPIWith.CURRENT_REVISION, GerritAPIWith.CURRENT_FILES],
			async (c) =>
				(await (await c.revisions)?.[this.currentRevision].files) ??
				null
		);
	}

	public get detailedUploader(): Promise<GerritDetailedUser | null> {
		return this._fieldFallbackGetter(
			'_detailedUploader',
			[GerritAPIWith.DETAILED_ACCOUNTS, GerritAPIWith.CURRENT_REVISION],
			async (c) =>
				(await (
					await c.revisions
				)?.[this.currentRevision].detailedUploader) ?? null
		);
	}

	constructor(
		protected _id: string,
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

		if (response.files) {
			this._files = Object.fromEntries(
				Object.entries(response.files).map(
					([k, v]) =>
						[
							k,
							new GerritFile(
								this._id,
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
