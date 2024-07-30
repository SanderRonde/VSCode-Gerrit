import { GerritAuthor, GerritCommitResponse } from './types';
import { DynamicallyFetchable } from './shared';
import { GerritRepo } from '../gerritRepo';
import { Data } from '../../util/data';

export class GerritCommit extends DynamicallyFetchable {
	public parents: { commit: string; subject: string }[];
	public author: GerritAuthor;
	public committer: GerritAuthor;
	public subject: string;
	public message: string;

	public constructor(
		public override changeID: string,
		public override gerritReposD: Data<GerritRepo[]>,
		public override gerritRepo: GerritRepo,
		public currentRevision: string,
		response: GerritCommitResponse
	) {
		super();
		this.parents = response.parents;
		this.author = response.author;
		this.committer = response.committer;
		this.subject = response.subject;
		this.message = response.message;
	}
}
