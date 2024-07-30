import {
	GerritChangeDetailResponse,
	GerritChangeStatus,
	GerritDetailedChangeLabels,
} from './types';
import { DateTime } from '../../util/dateTime';
import { GerritGroup } from './gerritGroup';
import { GerritRepo } from '../gerritRepo';
import { GerritUser } from './gerritUser';
import { Data } from '../../util/data';

export class GerritChangeDetail {
	public id: string;
	public project: string;
	public branch: string;
	public changeID: string;
	public subject: string;
	public status: GerritChangeStatus;
	public created: string;
	public updated: string;
	public mergeable: boolean;
	public insertions: number;
	public deletions: number;
	public number: number;
	public owner: GerritUser;
	public labels: GerritDetailedChangeLabels;
	public permittedLabels: Record<string, string[]>;
	public removableReviewers: GerritUser[];
	public reviewers: (GerritUser | GerritGroup)[];
	public cc: (GerritUser | GerritGroup)[];
	public reviewerUpdates: {
		state: string;
		reviewer: GerritUser;
		updatedBy: GerritUser;
		updated: DateTime;
	}[];
	public messages: {
		id: string;
		author: GerritUser;
		date: DateTime;
		message: string;
		revisionNumber: number;
	}[];
	public isWip: boolean;

	public fetchedAt = new DateTime(new Date());

	public constructor(
		response: GerritChangeDetailResponse,
		public readonly gerritReposD: Data<GerritRepo[]>
	) {
		this.id = response.id;
		this.project = response.project;
		this.branch = response.branch;
		this.changeID = response.change_id;
		this.subject = response.subject;
		this.status = response.status;
		this.created = response.created;
		this.updated = response.updated;
		this.mergeable = response.mergeable;
		this.insertions = response.insertions;
		this.deletions = response.deletions;
		this.number = response._number;
		this.isWip = !response.has_review_started;
		this.owner = new GerritUser(response.owner, gerritReposD);
		this.labels = response.labels;
		this.permittedLabels = response.permitted_labels;
		this.removableReviewers = response.removable_reviewers.map(
			(u) => new GerritUser(u, gerritReposD)
		);
		this.reviewers = (response.reviewers.REVIEWER ?? []).map((r) =>
			'_account_id' in r
				? new GerritUser(r, gerritReposD)
				: new GerritGroup(r.name, r)
		);
		this.cc = (response.reviewers.CC ?? []).map((r) =>
			'_account_id' in r
				? new GerritUser(r, gerritReposD)
				: new GerritGroup(r.name, r)
		);

		this.reviewerUpdates = response.reviewer_updates.map((u) => ({
			...u,
			reviewer: new GerritUser(u.reviewer, gerritReposD),
			updatedBy: new GerritUser(u.updated_by, gerritReposD),
			updated: new DateTime(u.updated),
		}));
		this.messages = response.messages.map((m) => ({
			...m,
			author: new GerritUser(m.author, gerritReposD),
			date: new DateTime(m.date),
			revisionNumber: m._revision_number,
		}));
	}
}
