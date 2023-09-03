import { GerritMergeableInfoResponse } from './types';

export class GerritChangeMergeable {
	public submitType: SubmitType;
	public strategy: MergeStrategy | undefined;
	public mergeable: boolean;
	public commitMerged: boolean;
	public contentMerged: boolean;

	public constructor(response: GerritMergeableInfoResponse) {
		this.submitType = response.submit_type;
		this.strategy = response.strategy;
		this.mergeable = response.mergeable;
		this.commitMerged = response.commit_merged;
		this.contentMerged = response.content_merged;
	}
}

export enum SubmitType {
	MERGE_IF_NECESSARY = 'MERGE_IF_NECESSARY',
	MERGE_ALWAYS = 'MERGE_ALWAYS',
	CHERRY_PICK = 'CHERRY_PICK',
	REBASE_IF_NECESSARY = 'REBASE_IF_NECESSARY',
	REBASE_ALWAYS = 'REBASE_ALWAYS',
	FAST_FORWARD_ONLY = 'FAST_FORWARD_ONLY',
}

export enum MergeStrategy {
	RECURSIVE = 'recursive',
	RESOLVE = 'resolve',
	SIMPLE_TWO_WAY_IN_CORE = 'simple-two-way-in-core',
	OURS = 'ours',
	THEIRS = 'theirs',
}
