import {
	GerritChangeLabels,
	GerritChangeResponse,
	GerritChangeStatus,
	GerritDetailedChangeLabels,
	GerritUserResponse,
} from './types';
import { PatchsetDescription } from '../../../views/activityBar/changes/changeTreeView';
import { joinSubscribables } from '../../subscriptions/subscriptionUtil';
import { DefaultChangeFilter, GerritChangeFilter } from './filters';
import { GerritComment, GerritDraftComment } from './gerritComment';
import { Subscribable } from '../../subscriptions/subscriptions';
import { getAPI, getAPIForSubscription } from '../gerritAPI';
import { ChangesOffsetParams, GerritAPIWith } from './api';
import { GerritChangeDetail } from './gerritChangeDetail';
import { GerritRevision } from './gerritRevision';
import { DynamicallyFetchable } from './shared';
import { DateTime } from '../../util/dateTime';
import { GerritCommit } from './gerritCommit';
import { GerritUser } from './gerritUser';

export type CommentMap = Map<string, (GerritComment | GerritDraftComment)[]>;

export class GerritChange extends DynamicallyFetchable {
	public override changeID: string;
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
	public number: number;
	public workInProgress?: boolean;
	public owner: GerritUserResponse;
	public moreChanges: boolean;

	public fetchedAt = new DateTime(new Date());

	// Ideally this would be private but in order to make the typing
	// below work we use public
	public _labels: GerritChangeLabels | null = null;
	public _detailedLabels: GerritDetailedChangeLabels | null = null;
	public _detailedOwner: GerritUser | null = null;
	public _revisions: Record<string, GerritRevision> | null = null;
	public _currentRevisions: Record<string, GerritRevision> | null = null;
	public _currentRevision: PatchsetDescription | null = null;

	public constructor(
		response: GerritChangeResponse,
		private readonly _isAllRevisions: boolean
	) {
		super();
		this.changeID = response.id;
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
		this.number = response._number;
		this.workInProgress = response.work_in_progress;
		this.owner = response.owner;
		this.moreChanges = response._more_changes ?? false;
		this._currentRevision = response.current_revision
			? {
					id: response.current_revision,
					number: response.revisions![response.current_revision]
						._number,
			  }
			: null;

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
			this._currentRevisions = Object.fromEntries(
				Object.entries(response.revisions).map(
					([k, v]) =>
						[
							k,
							new GerritRevision(
								this.changeID,
								this.project,
								k,
								k === response.current_revision!,
								v
							),
						] as [string, GerritRevision]
				)
			);
			if (this._isAllRevisions) {
				this._revisions = this._currentRevisions;
			}
		}
	}

	public static async getAllComments(
		changeID: string
	): Promise<Subscribable<CommentMap>> {
		const api = await getAPIForSubscription();

		return joinSubscribables(
			(comments, draftComments): CommentMap => {
				const mergedMap: Map<
					string,
					(GerritComment | GerritDraftComment)[]
				> = new Map();
				for (const [key, entries] of [
					...comments.entries(),
					...draftComments.entries(),
				]) {
					if (!mergedMap.has(key)) {
						mergedMap.set(key, []);
					}
					mergedMap.get(key)!.push(...entries);
				}
				return mergedMap;
			},
			api.getComments(changeID),
			api.getDraftComments(changeID)
		);
	}

	/**
	 * Note that the first level of filters is OR, while the second
	 * level of filters is AND
	 */
	public static async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		offset: ChangesOffsetParams,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: GerritAPIWith[]
	): Promise<Subscribable<GerritChange[]> | null> {
		const api = await getAPI();
		if (!api) {
			return null;
		}

		return api.getChanges(filters, offset, onError, ...withValues);
	}

	public static async getChange(
		changeID: string,
		withValues: GerritAPIWith[] = [],
		options?: {
			allowFail?: boolean;
		}
	): Promise<Subscribable<GerritChange | null>> {
		const api = await getAPIForSubscription();
		return api.getChange(changeID, null, withValues, options);
	}

	public static async getChangeOnce(
		changeID: string,
		withValues: GerritAPIWith[] = [],
		options?: {
			allowFail?: boolean;
		}
	): Promise<GerritChange | null> {
		return (await this.getChange(changeID, withValues, options)).getValue();
	}

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

	public currentRevisions(
		...additionalWith: GerritAPIWith[]
	): Promise<Record<string, GerritRevision> | null> {
		return this._fieldFallbackGetter(
			'_currentRevisions',
			[GerritAPIWith.CURRENT_REVISION, ...additionalWith],
			(c) => c.revisions(),
			async (c) => {
				this._currentRevision = await c.currentRevision();
			}
		);
	}

	public revisions(
		...additionalWith: GerritAPIWith[]
	): Promise<Record<string, GerritRevision> | null> {
		return this._fieldFallbackGetter(
			'_revisions',
			[GerritAPIWith.ALL_REVISIONS, ...additionalWith],
			(c) => c.revisions(),
			async (c) => {
				this._currentRevision = await c.currentRevision();
				this._currentRevisions = await this.currentRevisions();
			}
		);
	}

	public currentRevision(
		...additionalWith: GerritAPIWith[]
	): Promise<PatchsetDescription | null> {
		return this._fieldFallbackGetter(
			'_currentRevision',
			[GerritAPIWith.CURRENT_REVISION, ...additionalWith],
			(c) => c.currentRevision(),
			async (c) => {
				this._currentRevisions = await c.currentRevisions();
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
		const revisions = await this.currentRevisions(...additionalWith);
		if (!revisions) {
			return null;
		}
		return revisions[currentRevision.id];
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

	public async getDetail(): Promise<GerritChangeDetail | null> {
		const api = await getAPI();
		if (!api) {
			return null;
		}

		return api.getChangeDetail(this.changeID);
	}
}
