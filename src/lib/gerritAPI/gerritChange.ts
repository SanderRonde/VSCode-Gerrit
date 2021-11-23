import {
	GerritChangeLabels,
	GerritChangeResponse,
	GerritChangeStatus,
	GerritDetailedChangeLabels,
	GerritDetailedUser,
	GerritUser,
} from '../../types/gerritAPI';
import { GerritRevision } from './gerritRevision';
import { DynamicallyFetchable } from './shared';
import { GerritAPIWith } from './api';

export class GerritChange extends DynamicallyFetchable {
	protected _id: string;
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
	public owner: GerritUser;

	// Ideally this would be private but in order to make the typing
	// below work we use public
	public _labels: GerritChangeLabels | null = null;
	public _detailedLabels: GerritDetailedChangeLabels | null = null;
	public _detailedOwner: GerritDetailedUser | null = null;
	public _revisions: Record<string, GerritRevision> | null = null;
	public _currentRevision: string | null = null;

	public get labels(): Promise<GerritChangeLabels | null> {
		return this._fieldFallbackGetter(
			'_labels',
			GerritAPIWith.LABELS,
			(c) => c.labels
		);
	}

	public get detailedLabels(): Promise<GerritDetailedChangeLabels | null> {
		return this._fieldFallbackGetter(
			'_detailedLabels',
			GerritAPIWith.DETAILED_LABELS,
			(c) => c.detailedLabels
		);
	}

	public get detailedOwner(): Promise<GerritDetailedUser | null> {
		return this._fieldFallbackGetter(
			'_detailedOwner',
			GerritAPIWith.DETAILED_ACCOUNTS,
			(c) => c.detailedOwner
		);
	}

	public get revisions(): Promise<Record<string, GerritRevision> | null> {
		return this._fieldFallbackGetter(
			'_revisions',
			GerritAPIWith.CURRENT_REVISION,
			(c) => c.revisions,
			async (c) => {
				this._currentRevision = await c.currentRevision;
			}
		);
	}

	public get currentRevision(): Promise<string | null> {
		return this._fieldFallbackGetter(
			'_currentRevision',
			GerritAPIWith.CURRENT_REVISION,
			(c) => c.currentRevision,
			async (c) => {
				this._revisions = await c.revisions;
			}
		);
	}

	constructor(response: GerritChangeResponse) {
		super();
		this._id = response.id;
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
			this._detailedOwner = response.owner;
		}

		if (response.revisions) {
			this._revisions = Object.fromEntries(
				Object.entries(response.revisions).map(
					([k, v]) =>
						[k, new GerritRevision(this._id, k, v)] as [
							string,
							GerritRevision
						]
				)
			);
		}
	}
}
