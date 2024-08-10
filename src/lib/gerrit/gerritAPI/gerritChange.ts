import {
	GerritChangeLabels,
	GerritChangeResponse,
	GerritChangeStatus,
	GerritDetailedChangeLabels,
	GerritUserResponse,
} from './types';
import { PatchsetDescription } from '../../../views/activityBar/changes/changeTreeView';
import {
	getCurrentChangeForRepo,
	getCurrentChangeIDCached,
} from '../../git/commit';
import { joinSubscribables } from '../../subscriptions/subscriptionUtil';
import { GerritComment, GerritDraftComment } from './gerritComment';
import { getAPIForRepo, getAPIForSubscription } from '../gerritAPI';
import { DefaultChangeFilter, GerritChangeFilter } from './filters';
import { Subscribable } from '../../subscriptions/subscriptions';
import { ChangesOffsetParams, GerritAPIWith } from './api';
import { getConfiguration } from '../../vscode/config';
import { GerritRevision } from './gerritRevision';
import { DynamicallyFetchable } from './shared';
import { DateTime } from '../../util/dateTime';
import { GerritCommit } from './gerritCommit';
import { GerritRepo } from '../gerritRepo';
import { GerritUser } from './gerritUser';
import { Data } from '../../util/data';

export interface ChangeIDWithRepo {
	gerritRepo: GerritRepo;
	changeID: string;
}

export type CommentMap = Map<string, (GerritComment | GerritDraftComment)[]>;

export class GerritChange extends DynamicallyFetchable {
	/** Format: project~branch~I{40-hex-chars} */
	public override changeID: string;
	/** Format: project~branch~I{40-hex-chars} */
	public id: string;
	public project: string;
	public branch: string;
	/** Format: I{40-hex-chars} */
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
		public gerritReposD: Data<GerritRepo[]>,
		public gerritRepo: GerritRepo,
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
			this._detailedOwner = new GerritUser(response.owner, gerritReposD);
		}

		if (response.revisions) {
			this._currentRevisions = Object.fromEntries(
				Object.entries(response.revisions).map(
					([k, v]) =>
						[
							k,
							new GerritRevision(
								this,
								this.changeID,
								this.gerritReposD,
								this.gerritRepo,
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
		gerritReposD: Data<GerritRepo[]>,
		change: ChangeIDWithRepo,
		options?: { allowFail: boolean }
	): Promise<Subscribable<CommentMap>> {
		const api = await getAPIForSubscription(
			gerritReposD,
			change.gerritRepo,
			options?.allowFail
		);

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
			api.getComments(change.changeID),
			api.getDraftComments(change.changeID)
		);
	}

	/**
	 * Note that the first level of filters is OR, while the second
	 * level of filters is AND
	 */
	public static async getChanges(
		gerritReposD: Data<GerritRepo[]>,
		gerritRepo: GerritRepo,
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
		const api = await getAPIForRepo(gerritReposD, gerritRepo);
		if (!api) {
			return null;
		}

		return api.getChanges(filters, offset, onError, ...withValues);
	}

	public static async getChange(
		gerritReposD: Data<GerritRepo[]>,
		change: ChangeIDWithRepo,
		withValues: GerritAPIWith[] = [],
		options?: {
			allowFail?: boolean;
		}
	): Promise<Subscribable<GerritChange | null>> {
		const api = await getAPIForSubscription(
			gerritReposD,
			change.gerritRepo,
			options?.allowFail
		);
		return api.getChange(change.changeID, null, withValues);
	}

	public static async getChangeOnce(
		gerritReposD: Data<GerritRepo[]>,
		change: ChangeIDWithRepo,
		withValues: GerritAPIWith[] = [],
		options?: {
			allowFail?: boolean;
		}
	): Promise<GerritChange | null> {
		return (
			await this.getChange(gerritReposD, change, withValues, options)
		).getValue();
	}

	public static async getCurrentChangeOnce(
		gerritReposD: Data<GerritRepo[]>,
		gerritRepo: GerritRepo,
		withValues: GerritAPIWith[] = [],
		{
			allowFail = true,
			cachedID = true,
		}: {
			allowFail?: boolean;
			cachedID?: boolean;
		} = {}
	): Promise<GerritChange | null> {
		const changeID = cachedID
			? await getCurrentChangeIDCached()
			: await getCurrentChangeForRepo(gerritRepo);
		if (!changeID) {
			return null;
		}
		return (
			await this.getChange(gerritReposD, changeID, withValues, {
				allowFail,
			})
		).getValue();
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
			(c) => c.allRevisions(),
			async (c) => {
				this._currentRevision = await c.currentRevision();
			}
		);
	}

	public allRevisions(
		...additionalWith: GerritAPIWith[]
	): Promise<Record<string, GerritRevision> | null> {
		return this._fieldFallbackGetter(
			'_revisions',
			[GerritAPIWith.ALL_REVISIONS, ...additionalWith],
			(c) => c.allRevisions(),
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

	public async getFormattedNames(): Promise<{
		label: string;
		description?: string;
	}> {
		const template = getConfiguration().get('gerrit.changeTitleTemplate');

		let owner: GerritUser | null = null;
		const getTemplateValueContent = async (
			templateValue: string
		): Promise<string> => {
			if (templateValue === 'number') {
				return String(this.number);
			}
			if (templateValue === 'subject' || templateValue === 'title') {
				return this.subject;
			}
			if (templateValue === 'owner') {
				owner ??= await this.detailedOwner();
				return owner?.getName() ?? '<no_owner>';
			}
			if (templateValue === 'repo') {
				return this.project;
			}
			if (templateValue === 'branch') {
				return this.branch;
			}
			if (templateValue === 'status') {
				if (this.workInProgress) {
					return 'WIP';
				}
				return this.status;
			}
			return '<unknown_template_value>';
		};

		const getSingleFormattedName = async (
			template: string
		): Promise<string> => {
			for (
				let match = /\${(\w+)}/.exec(template);
				match;
				match = /\${(\w+)}/.exec(template)
			) {
				const [fullMatch, templateValue] = match;
				const value = await getTemplateValueContent(templateValue);
				template = template.replace(fullMatch, value);
			}
			return template;
		};

		return {
			description: await getSingleFormattedName(
				template.subtitle ?? '<no_subtitle>'
			),
			label: await getSingleFormattedName(template.title ?? '<no_title>'),
		};
	}
}
