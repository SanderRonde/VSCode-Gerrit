import { GerritAuthor, GerritCommitResponse } from './types';
import { DynamicallyFetchable } from './shared';

export class GerritCommit extends DynamicallyFetchable {
	public parents: { commit: string; subject: string }[];
	public author: GerritAuthor;
	public committer: GerritAuthor;
	public subject: string;
	public message: string;

	public constructor(
		protected _patchID: string,
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
