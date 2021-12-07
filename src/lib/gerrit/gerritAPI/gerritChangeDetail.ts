import {
	GerritChangeDetailResponse,
	GerritChangeStatus,
	GerritDetailedChangeLabels,
} from './types';
import { GerritComment, GerritDraftComment } from './gerritComment';
import { DateTime } from '../../util/dateTime';
import { GerritUser } from './gerritUser';

export type CommentMap = Map<string, (GerritComment | GerritDraftComment)[]>;

export class GerritChangeDetail {
	public id: string;
	public project: string;
	public branch: string;
	public attentionSet: Record<
		string,
		{
			account: GerritUser;
			lastUpdate: DateTime;
			reason: string;
		}[]
	>;
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
	public reviewers: GerritUser[];
	public cc: GerritUser[];
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

	public constructor(response: GerritChangeDetailResponse) {
		this.id = response.id;
		this.project = response.project;
		this.branch = response.branch;
		console.log(response);
		console.log(response.attention_set);
		this.attentionSet = Object.fromEntries(
			Object.entries(response.attention_set ?? {}).map(
				([key, userAttentionSet]) => [
					key,
					userAttentionSet.map((update) => ({
						...update,
						account: new GerritUser(update.account),
						lastUpdate: new DateTime(update.last_update),
					})),
				]
			)
		);
		this.changeID = response.change_id;
		this.subject = response.subject;
		this.status = response.status;
		this.created = response.created;
		this.updated = response.updated;
		this.mergeable = response.mergeable;
		this.insertions = response.insertions;
		this.deletions = response.deletions;
		this.number = response._number;
		this.owner = new GerritUser(response.owner);
		this.labels = response.labels;
		this.permittedLabels = response.permitted_labels;
		this.removableReviewers = response.removable_reviewers.map(
			(u) => new GerritUser(u)
		);
		this.reviewers = (response.reviewers.REVIEWER ?? []).map(
			(r) => new GerritUser(r)
		);
		this.cc = (response.reviewers.CC ?? []).map((r) => new GerritUser(r));

		this.reviewerUpdates = response.reviewer_updates.map((u) => ({
			...u,
			reviewer: new GerritUser(u.reviewer),
			updatedBy: new GerritUser(u.updated_by),
			updated: new DateTime(u.updated),
		}));
		this.messages = response.messages.map((m) => ({
			...m,
			author: new GerritUser(m.author),
			date: new DateTime(m.date),
			revisionNumber: m._revision_number,
		}));
	}
}
