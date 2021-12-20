import { GerritChangeStatus, RevisionType } from '../gerrit/gerritAPI/types';

export type StreamEvent =
	| AssigneeChangedEvent
	| ChangeAbandonedEvent
	| ChangeDeletedEvent
	| ChangeMergedEvent
	| ChangeRestoredEvent
	| DroppedOutEvent
	| HashtagsChangedEvent
	| CommentAddedEvent
	| ProjectCreatedEvent
	| PatchsetCreatedEvent
	| RefUpdatedEvent
	| ReviewerAddedEvent
	| ReviewerDeletedEvent
	| TopicChangedEvent
	| WorkInProgressStateChangedEvent
	| VoteDeletedEvent;

type MessageJSON = {
	timestamp: SecondsSinceUnixEpoch;
	reviewer: AccountJSON;
	message: string;
};

type TrackingIDJSON = {
	system: string;
	id: number;
};

type DependencyJSON = {
	id: string;
	number: number;
	revision: string;
	ref: string;
	isCurrentPatchset: boolean;
};

enum SubmitStatus {
	OK = 'OK',
	NOT_READY = 'NOT_READY',
	RULE_ERROR = 'RULE_ERROR',
}

enum LabelStatus {
	OK = 'OK',
	REJECT = 'REJECT',
	NEED = 'NEED',
	MAY = 'MAY',
	IMPOSSIBLE = 'IMPOSSIBLE',
}

type LabelJSON = {
	label: string;
	status: LabelStatus;
	by: AccountJSON;
};

type RequirementJSON = {
	fallbackText: string;
	type: string;
	data?: Record<string, string>;
};

type SubmitRecordJSON = {
	status: SubmitStatus;
	labels: LabelJSON[];
	requirements: RequirementJSON[];
};

type ChangeJSON = {
	project: string;
	branch: string;
	topic: string;
	id: string;
	/**
	 * @deprecated
	 */
	number?: number;
	subject: string;
	owner: AccountJSON;
	url: string;
	commitMessage: string;
	hashtags: string[];
	createdOn: SecondsSinceUnixEpoch;
	lastUpdated: SecondsSinceUnixEpoch;
	open: boolean;
	status: GerritChangeStatus;
	private: boolean;
	wip: boolean;
	comments: MessageJSON[];
	trackingIds: TrackingIDJSON[];
	currentPatchSet: PatchSetJSON;
	dependsOn: DependencyJSON[];
	neededBy: DependencyJSON[];
	submitRecords: SubmitRecordJSON;
	allReviewers: AccountJSON[];
};

type AccountJSON = {
	name?: string;
	email: string;
	username?: string;
};

type PatchsetCommentJSON = {
	file: string;
	line: number;
	reviewer: AccountJSON;
	message: string;
};

enum FileChangeType {
	ADDED = 'ADDED',
	DELETED = 'DELETED',
	MODIFIED = 'MODIFIED',
	RENAMED = 'RENAMED',
	COPIED = 'COPIED',
	REWRITE = 'REWRITE',
}

type FileJSON = {
	file: string;
	fileOld: string;
	type: FileChangeType;
	insertions: number;
	deletions: number;
};

type PatchSetJSON = {
	number: number;
	revision: string;
	parents: string[];
	ref: string;
	uploader: AccountJSON;
	author: AccountJSON;
	createdOn: SecondsSinceUnixEpoch;
	kind: RevisionType;
	approvals: ApprovalJSON[];
	comments: PatchsetCommentJSON[];
	files: FileJSON[];
	sizeInsertions: number;
	sizeDeletions: number;
};

type ApprovalJSON = {
	type: string;
	description: string;
	value: number;
	oldValue?: number;
	grantedOn: SecondsSinceUnixEpoch;
	by: AccountJSON;
};

type RefUpdateJSON = {
	oldrev: string;
	newRev: string | '0000000000000000000000000000000000000000';
	refName: string;
	project: string;
};

type SecondsSinceUnixEpoch = number & { __secondsSinceUnixEpoch: never };

type AssigneeChangedEvent = {
	type: 'assignee-changed';
	change: ChangeJSON;
	changer: AccountJSON;
	oldAssignee: unknown;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type ChangeAbandonedEvent = {
	type: 'change-abandoned';
	change: ChangeJSON;
	abandoner: AccountJSON;
	patchSet: PatchSetJSON;
	reason: string;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type ChangeDeletedEvent = {
	type: 'change-deleted';
	change: ChangeJSON;
	deleter: AccountJSON;
};

type ChangeMergedEvent = {
	type: 'change-merged';
	change: ChangeJSON;
	patchSet: PatchSetJSON;
	submitter: AccountJSON;
	newRev: string;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type ChangeRestoredEvent = {
	type: 'change-restored';
	change: ChangeJSON;
	patchSet: PatchSetJSON;
	restorer: AccountJSON;
	reason: string;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type CommentAddedEvent = {
	type: 'comment-added';
	change: ChangeJSON;
	patchSet: PatchSetJSON;
	author: AccountJSON;
	approvals: ApprovalJSON[];
	comment: string;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type DroppedOutEvent = {
	type: 'dropped-out';
};

type HashtagsChangedEvent = {
	type: 'hashtags-changed';
	change: ChangeJSON;
	editor: AccountJSON;
	added: string[];
	removed: string[];
	hashtags: string[];
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type ProjectCreatedEvent = {
	type: 'project-created';
	projectName: string;
	projectHead: string;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type PatchsetCreatedEvent = {
	type: 'patchset-created';
	change: ChangeJSON;
	patchSet: PatchSetJSON;
	uploader: AccountJSON;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type RefUpdatedEvent = {
	type: 'ref-updated';
	submitter: AccountJSON;
	refUpdate: RefUpdateJSON;
};

type ReviewerAddedEvent = {
	type: 'reviewer-added';
	change: ChangeJSON;
	patchSet: PatchSetJSON;
	reviewer: AccountJSON;
	adder: AccountJSON;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type ReviewerDeletedEvent = {
	type: 'reviewer-deleted';
	change: ChangeJSON;
	patchSet: PatchSetJSON;
	reviewer: AccountJSON;
	remover: AccountJSON;
	approvals: ApprovalJSON[];
	comment: string;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type TopicChangedEvent = {
	type: 'topic-changed';
	change: ChangeJSON;
	changer: AccountJSON;
	oldTopic: string;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type WorkInProgressStateChangedEvent = {
	type: 'wip-state-changed';
	change: ChangeJSON;
	patchSet: PatchSetJSON;
	changer: AccountJSON;
	eventCreatedOn: SecondsSinceUnixEpoch;
};

type VoteDeletedEvent = {
	type: 'vote-deleted';
	change: ChangeJSON;
	patchSet: PatchSetJSON;
	reviewer: AccountJSON;
	remover: AccountJSON;
	approvals: ApprovalJSON[];
	comment: string;
};
