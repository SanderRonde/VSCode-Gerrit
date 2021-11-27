import {
	GerritChangeLabels,
	GerritChangeResponse,
	GerritChangeStatus,
	GerritDetailedChangeLabels,
	GerritDetailedUserResponse,
	GerritUserResponse,
} from './types';
import { DefaultChangeFilter, GerritChangeFilter } from './filters';
import { GerritRevision } from './gerritRevision';
import { DynamicallyFetchable } from './shared';
import { getChangeCache } from '../gerritCache';
import { GerritCommit } from './gerritCommit';
import { GerritUser } from './gerritUser';
import { GerritAPIWith } from './api';
import { getAPI } from '../gerritAPI';

export class GerritChange extends DynamicallyFetchable {
	protected _patchID: string;
	public id: string;
	public project: string;
	public branch: string;
	public change_id: string;
	public subject: string;
	public status: GerritChangeStatus;
	public created: string;
	public updated: string;
	public mergeable: boolean;
	public insertions: number;
	public deletions: number;
	public _number: number;
	public work_in_progress?: boolean;
	public owner: GerritUserResponse;

	// Ideally this would be private but in order to make the typing
	// below work we use public
	public _labels: GerritChangeLabels | null = null;
	public _detailedLabels: GerritDetailedChangeLabels | null = null;
	public _detailedOwner: GerritUser | null = null;
	public _revisions: Record<string, GerritRevision> | null = null;
	public _currentRevision: string | null = null;

	public labels(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritChangeLabels | null> {
		return this._fieldFallbackGetter(
			'_labels',
			[GerritAPIWith.LABELS, ...additionalWith],
			(c) => c.labels()
		);
	}

	public detailedLabels(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritDetailedChangeLabels | null> {
		return this._fieldFallbackGetter(
			'_detailedLabels',
			[GerritAPIWith.DETAILED_LABELS, ...additionalWith],
			(c) => c.detailedLabels()
		);
	}

	public detailedOwner(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritUser | null> {
		return this._fieldFallbackGetter(
			'_detailedOwner',
			[GerritAPIWith.DETAILED_ACCOUNTS, ...additionalWith],
			(c) => c.detailedOwner()
		);
	}

	public revisions(
		...additionalWith: GerritAPIWith[]
	): Promise<Record<string, GerritRevision> | null> {
		return this._fieldFallbackGetter(
			'_revisions',
			[GerritAPIWith.CURRENT_REVISION, ...additionalWith],
			(c) => c.revisions(),
			async (c) => {
				this._currentRevision = await c.currentRevision();
			}
		);
	}

	public currentRevision(
		...additionalWith: GerritAPIWith[]
	): Promise<string | null> {
		return this._fieldFallbackGetter(
			'_currentRevision',
			[GerritAPIWith.CURRENT_REVISION, ...additionalWith],
			(c) => c.currentRevision(),
			async (c) => {
				this._revisions = await c.revisions();
			}
		);
	}

	public async getCurrentRevision(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritRevision | null> {
		const currentRevision = await this.currentRevision(...additionalWith);
		if (!currentRevision) {
			return null;
		}
		const revisions = await this.revisions(...additionalWith);
		if (!revisions) {
			return null;
		}
		return revisions[currentRevision];
	}

	public async getCurrentCommit(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritCommit | null> {
		const currentRevision = await this.getCurrentRevision(
			GerritAPIWith.CURRENT_REVISION,
			GerritAPIWith.CURRENT_COMMIT,
			...additionalWith
		);

		if (!currentRevision) {
			return null;
		}

		return await currentRevision.commit();
	}

	constructor(response: GerritChangeResponse) {
		super();
		this._patchID = response.id;
		this.id = response.id;
		this.project = response.project;
		this.branch = response.branch;
		this.change_id = response.change_id;
		this.subject = response.subject;
		this.status = response.status;
		this.created = response.created;
		this.updated = response.updated;
		this.mergeable = response.mergeable;
		this.insertions = response.insertions;
		this.deletions = response.deletions;
		this._number = response._number;
		this.work_in_progress = response.work_in_progress;
		this.owner = response.owner;
		this._currentRevision = response.current_revision ?? null;

		if (response.labels) {
			this._labels = response.labels;
			if (Object.values(response.labels).some((v) => 'all' in v)) {
				this._detailedLabels =
					response.labels as GerritDetailedChangeLabels;
			}
		}
		if (
			'display_name' in response.owner ||
			'email' in response.owner ||
			'username' in response.owner ||
			'name' in response.owner
		) {
			this._detailedOwner = new GerritUser(response.owner);
		}

		if (response.revisions) {
			this._revisions = Object.fromEntries(
				Object.entries(response.revisions).map(
					([k, v]) =>
						[k, new GerritRevision(this._patchID, this, k, v)] as [
							string,
							GerritRevision
						]
				)
			);
		}
	}

	/**
	 * Note that the first level of filters is OR, while the second
	 * level of filters is AND
	 */
	static getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith[]
	) {
		const api = getAPI();
		if (!api) {
			return [];
		}

		return api.getChanges(filters, ...withValues);
	}

	static getChange(changeId: string, ...withValues: GerritAPIWith[]) {
		const api = getAPI();
		if (!api) {
			return null;
		}

		return api.getChange(changeId, ...withValues);
	}

	static getChangeCached(changeId: string, ...withValues: GerritAPIWith[]) {
		const cache = getChangeCache();
		if (cache.has(changeId, withValues)) {
			return cache.get(changeId, withValues)!;
		}

		return this.getChange(changeId, ...withValues);
	}
}
