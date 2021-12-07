import {
	GerritChangeLabels,
	GerritChangeResponse,
	GerritChangeStatus,
	GerritDetailedChangeLabels,
	GerritUserResponse,
} from './types';
import { DefaultChangeFilter, GerritChangeFilter } from './filters';
import { GerritComment, GerritDraftComment } from './gerritComment';
import { ChangesOffsetParams, GerritAPIWith } from './api';
import { GerritChangeDetail } from './gerritChangeDetail';
import { GerritRevision } from './gerritRevision';
import { DynamicallyFetchable } from './shared';
import { getChangeCache } from '../gerritCache';
import { GerritCommit } from './gerritCommit';
import { GerritUser } from './gerritUser';
import { getAPI } from '../gerritAPI';

export type CommentMap = Map<string, (GerritComment | GerritDraftComment)[]>;

export class GerritChange extends DynamicallyFetchable {
	private static _commentMap: Map<string, CommentMap> = new Map();

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

	// Ideally this would be private but in order to make the typing
	// below work we use public
	public _labels: GerritChangeLabels | null = null;
	public _detailedLabels: GerritDetailedChangeLabels | null = null;
	public _detailedOwner: GerritUser | null = null;
	public _revisions: Record<string, GerritRevision> | null = null;
	public _currentRevision: GerritRevision | null = null;
	public _currentRevisionStr: string | null = null;

	public constructor(response: GerritChangeResponse) {
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
		this._currentRevision =
			response.revisions &&
			response.current_revision &&
			response.revisions[response.current_revision]
				? new GerritRevision(
						this.changeID,
						this,
						response.current_revision,
						response.revisions[response.current_revision]
				  )
				: null;
		this._currentRevisionStr = response.current_revision ?? null;

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
						[k, new GerritRevision(this.changeID, this, k, v)] as [
							string,
							GerritRevision
						]
				)
			);
		}
	}

	public static async getAllComments(changeID: string): Promise<CommentMap> {
		const api = await getAPI();
		if (!api) {
			return new Map();
		}

		const [comments, draftComments] = await Promise.all([
			api.getComments(changeID),
			api.getDraftComments(changeID),
		]);

		const mergedMap: Map<string, (GerritComment | GerritDraftComment)[]> =
			new Map();
		for (const [key, entries] of [
			...comments.entries(),
			...draftComments.entries(),
		]) {
			if (!mergedMap.has(key)) {
				mergedMap.set(key, []);
			}
			mergedMap.get(key)!.push(...entries);
		}

		GerritChange._commentMap.set(changeID, mergedMap);
		return mergedMap;
	}

	public static async getAllCommentsCached(
		changeID: string
	): Promise<CommentMap> {
		if (GerritChange._commentMap.has(changeID)) {
			return GerritChange._commentMap.get(changeID)!;
		}
		return this.getAllComments(changeID);
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
	): Promise<GerritChange[]> {
		const api = await getAPI();
		if (!api) {
			return [] as GerritChange[];
		}

		return await api.getChanges(filters, offset, onError, ...withValues);
	}

	public static async getChange(
		changeID: string,
		...withValues: GerritAPIWith[]
	): Promise<GerritChange | null> {
		const api = await getAPI();
		if (!api) {
			return null;
		}

		return await api.getChange(changeID, ...withValues);
	}

	public static async getChangeCached(
		changeID: string,
		...withValues: GerritAPIWith[]
	): Promise<GerritChange | null> {
		const cache = getChangeCache();
		if (cache.has(changeID, withValues)) {
			return cache.get(changeID, withValues)!;
		}

		return this.getChange(changeID, ...withValues);
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

	public revisions(
		...additionalWith: GerritAPIWith[]
	): Promise<Record<string, GerritRevision> | null> {
		return this._fieldFallbackGetter(
			'_revisions',
			[GerritAPIWith.ALL_REVISIONS, ...additionalWith],
			(c) => c.revisions(),
			async (c) => {
				this._currentRevisionStr = await c.currentRevisionStr();
			}
		);
	}

	public currentRevision(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritRevision | null> {
		return this._fieldFallbackGetter(
			'_currentRevision',
			[GerritAPIWith.CURRENT_REVISION, ...additionalWith],
			(c) => c.currentRevision(),
			async (c) => {
				this._revisions = await c.revisions();
			}
		);
	}

	public currentRevisionStr(
		...additionalWith: GerritAPIWith[]
	): Promise<string | null> {
		return this._fieldFallbackGetter(
			'_currentRevisionStr',
			[GerritAPIWith.CURRENT_REVISION, ...additionalWith],
			(c) => c.currentRevisionStr(),
			async (c) => {
				this._revisions = await c.revisions();
			}
		);
	}

	public async getCurrentRevision(
		...additionalWith: GerritAPIWith[]
	): Promise<GerritRevision | null> {
		const currentRevision = await this.currentRevisionStr(
			...additionalWith
		);
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

	public async getDetail(): Promise<GerritChangeDetail | null> {
		const api = await getAPI();
		if (!api) {
			return null;
		}

		return api.getChangeDetail(this.changeID);
	}
}
