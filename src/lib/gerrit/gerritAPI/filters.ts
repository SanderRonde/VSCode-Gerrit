export enum DefaultChangeFilter {
	IS_OPEN = 'is:open',
	IS_STARRED = 'is:starred',
	IS_CLOSED = 'is:closed',
	IS_WATCHED = 'is:watched',
	IS_WIP = 'is:wip',
	NOT_IS_WIP = '-is:wip',
	HAS_DRAFT = 'has:draft',
	OWNER_SELF = 'owner:self',
	NOT_OWNER_SELF = '-owner:self',
	REVIEWER_SELF = 'reviewer:self',
	ATTENTION_SELF = 'attention:self',
	CC_SELF = 'cc:self',
}

export type GerritChangeFilter = string & {
	__isFilter: true;
};

export function filterOr(
	...changes: DefaultChangeFilter[]
): GerritChangeFilter {
	return `(${changes.join(' OR ')})` as GerritChangeFilter;
}

export function ownerIs(owner: string): GerritChangeFilter {
	return `owner:${owner}` as GerritChangeFilter;
}

export function age(ageStr: string): GerritChangeFilter {
	return `age:${ageStr}` as GerritChangeFilter;
}

export function reviewerIs(reviewer: string): GerritChangeFilter {
	return `reviewer:${reviewer}` as GerritChangeFilter;
}

export function limit(limitNum: number): GerritChangeFilter {
	return `limit:${limitNum}` as GerritChangeFilter;
}

export function invert(filter: GerritChangeFilter): GerritChangeFilter {
	return `-${filter}` as GerritChangeFilter;
}

export function offset(amount: number): GerritChangeFilter {
	return `S:${amount}` as GerritChangeFilter;
}
