import { Disposable, QuickPickItem, ThemeIcon, window } from 'vscode';
import { SearchResultsTreeProvider } from '../searchResults';
import { setContextProp } from '../../../lib/vscode/context';
import { getAPI } from '../../../lib/gerrit/gerritAPI';
import { wait } from '../../../lib/util/util';

type ValueOrFunction<T> = T | ((currentQuery: string) => T | Promise<T>);

/**
 * Maps the start of a filter to its values (if any)
 */
interface SearchFilterMap {
	[key: string]: {
		description: string;
		items?: null | ValueOrFunction<
			{ description: string; label: string }[]
		>;
	};
}

const userFetcher = async (
	currentQuery: string
): Promise<
	{
		description: string;
		label: string;
	}[]
> => {
	// If there's no query yet we unfortunately can't do anything...
	// The Gerrit API only allows searching
	if (currentQuery === '') {
		return [];
	}

	const api = await getAPI();
	if (!api) {
		return [
			{
				label: 'self',
				description: 'current user',
			},
		];
	}

	return [
		{
			label: 'self',
			description: 'current user',
		},
		...(await api.getUsersCached(currentQuery, 100)).map((user) => ({
			label: user.username!,
			description: `User ${user.getName() ?? ''} ${
				user.email ? `(${user.email})` : ''
			}`,
		})),
	];
};

const groupFetcher = async (): Promise<
	{
		description: string;
		label: string;
	}[]
> => {
	const api = await getAPI();
	if (!api) {
		return [];
	}

	return [
		...(await api.getGroupsCached()).map((group) => ({
			label: group.name,
			description: group.description,
		})),
	];
};

const projectfetcher = async (): Promise<
	{
		description: string;
		label: string;
	}[]
> => {
	const api = await getAPI();
	if (!api) {
		return [];
	}

	return [
		...(await api.getProjectsCached()).map((project) => ({
			label: project.name,
			description: project.description,
		})),
	];
};

const STARTS_WITH_NUMBER_REGEX = /^(\d+)/;
const searchFilterMap: SearchFilterMap = {
	age: {
		description: 'Age of the change',
		items: (currentQuery: string) => {
			// If no query, offer some suggestions
			if (!currentQuery) {
				return [
					{
						label: '1d',
						description: '1 day',
					},
					{
						label: '2d',
						description: '2 days',
					},
					{
						label: '3d',
						description: '3 days',
					},
					{
						label: '1w',
						description: '1 week',
					},
					{
						label: '1mon',
						description: '1 month',
					},
					{
						label: '1y',
						description: '1 year',
					},
				];
			}

			// If query starts with a number, return a list of units for that number
			const match = STARTS_WITH_NUMBER_REGEX.exec(currentQuery);
			if (match) {
				const num = match[1];
				return [
					{
						label: 's',
						description: 'second',
					},
					{
						label: 'm',
						description: 'minute',
					},
					{
						label: 'h',
						description: 'hour',
					},
					{
						label: 'd',
						description: 'day',
					},
					{
						label: 'w',
						description: 'week',
					},
					{
						label: 'mon',
						description: 'month',
					},
					{
						label: 'y',
						description: 'year',
					},
				].map((unit) => ({
					label: `${num}${unit.label}`,
					description: `${num}${unit.description}`,
				}));
			} else {
				// No clue what they're typing, give up
				return [];
			}
		},
	},
	assignee: {
		description: 'Changes assigned to the given user',
		items: userFetcher,
	},
	attention: {
		description: 'Changes whose attention set includes the given user',
		items: userFetcher,
	},
	before: {
		description: 'Changes before the given time',
	},
	until: {
		description: 'Changes before the given time',
	},
	after: {
		description: 'Changes after the given time',
	},
	since: {
		description: 'Changes after the given time',
	},
	mergedbefore: {
		description: 'Changes merged before the given time',
	},
	mergedafter: {
		description: 'Changes merged after the given time',
	},
	change: {
		description: 'Change with given ID',
	},
	conflicts: {
		description: 'Changes that conflict with given change ID',
	},
	destination: {
		description:
			'Changes which match the specified USER’s destination named NAME',
	},
	owner: {
		description: 'Changes originally submitted by the given user',
		items: userFetcher,
	},
	ownerin: {
		description: 'Changes originally submitted by a user in given group',
		items: groupFetcher,
	},
	uploader: {
		description: 'Changes uploaded by the given user',
		items: userFetcher,
	},
	query: {
		description:
			"Changes which match the specified USER’s query named 'NAME'",
	},
	reviewer: {
		description: 'Changes reviewed by the given user',
		items: userFetcher,
	},
	cc: {
		description: 'Changes that have given user CCed on them',
		items: userFetcher,
	},
	revertof: {
		description: 'Changes that are revert of the given change ID',
	},
	submissionid: {
		description: 'Changes submitted with the given submission ID',
	},
	reviewerin: {
		description: 'Changes reviewed by a user in given group',
		items: groupFetcher,
	},
	commit: {
		description:
			'Changes where given commit is one of the patch sets of the change',
	},
	project: {
		description: 'Changes in the given project',
		items: projectfetcher,
	},
	projects: {
		description: 'Changes in projects starting with passed string',
	},
	parentof: {
		description: 'Changes that are parent of the given change ID',
	},
	parentproject: {
		description:
			'Changes in given project or in one of the children of given project',
		items: projectfetcher,
	},
	repository: {
		description: 'Changes in the given repository',
		items: projectfetcher,
	},
	repositories: {
		description:
			'Changes occuring in repositories starting with passed string',
	},
	parentrepository: {
		description:
			'Changes in given repository or in one of the children of given repository',
		items: projectfetcher,
	},
	branch: {
		description: 'Changes in the given branch',
	},
	intopic: {
		description: 'Changes whose topic contains given string',
	},
	topic: {
		description: 'Changes with given topic',
	},
	inhashtag: {
		description: 'Changes whose hashtags contain given string',
	},
	hashtag: {
		description: 'Changes with given hashtag',
	},
	cherrypickof: {
		description: 'Changes that are cherry-picked from given change ID',
	},
	ref: {
		description:
			'Changes where the destination branch is exactly given ref name',
	},
	tr: {
		description:
			'Search for changes whose commit message contains given ID and matches one or more of the trackingid sections',
	},
	bug: {
		description:
			'Search for changes whose commit message contains given ID and matches one or more of the trackingid sections',
	},
	label: {
		description:
			'Changes where given approval score has been set during a review',
	},
	message: {
		description: 'Changes whose commit message contains given string',
	},
	comment: {
		description: 'Changes whose comments contain given string',
	},
	path: {
		description: 'Changes where a file with given path was touched',
	},
	file: {
		description:
			'Changes where a file with given path was touched (stricter)',
	},
	extension: {
		description: 'Changes where a file with given extension was touched',
	},
	onlyeextensions: {
		description:
			'Changes where a file with any of the given extension was touched (comma-separated list)',
	},
	directory: {
		description: 'Changes where a file in the given directory was touched',
	},
	footer: {
		description:
			'Changes where given text is a footer in the commit has message',
	},
	star: {
		description:
			'Changes that have been starred by the current user with given label anme',
	},
	has: {
		description: 'Has given property',
		items: [
			{
				label: 'draft',
				description:
					'Changes that have a draft comment by current user',
			},
			{
				label: 'star',
				description: 'Changes that are starred by current user',
			},
			{
				label: 'edit',
				description:
					'Changes that have an inline edit created by current user',
			},
			{
				label: 'unresolved',
				description: 'Changes with unresolved comments',
			},
			{
				label: 'attention',
				description:
					'Changes that has the attention of the current user',
			},
		],
	},
	is: {
		description: 'Is given property',
		items: [
			{
				label: 'assigned',
				description: 'Changes that have an assignee',
			},
			{
				label: 'starred',
				description: 'Changes that are starred by current user',
			},
			{
				label: 'unassigned',
				description: 'Changes that do not have an assignee',
			},
			{
				label: 'attention',
				description:
					'Changes that have the attention of the current user',
			},
			{
				label: 'watched',
				description:
					"Changes that match any of current user's watch filters",
			},
			{
				label: 'reviewed',
				description:
					'Changes where any user has commented after the last update from the owner',
			},
			{
				label: 'owner',
				description: 'Changes where the owner is the current user',
			},
			{
				label: 'uploader',
				description: 'Changes where the current user is the uploader',
			},
			{
				label: 'reviewer',
				description: 'Changes where the current user is the reviewer',
			},
			{
				label: 'cc',
				description: 'Changes where the current user is in CC',
			},
			{
				label: 'open',
				description: 'Changes that are open',
			},
			{
				label: 'pending',
				description: 'Changes that are open',
			},
			{
				label: 'new',
				description: 'Changes that are open',
			},
			{
				label: 'closed',
				description: 'Changes that are merged or abandoned',
			},
			{
				label: 'merged',
				description: 'Changes that are merged',
			},
			{
				label: 'abandoned',
				description: 'Changes that are abandoned',
			},
			{
				label: 'submittable',
				description: 'Changes that are able to be submitted',
			},
			{
				label: 'mergeable',
				description:
					'Changes that are ready to be merged and have no conflicts',
			},
			{
				label: 'ignored',
				description: 'Changes that are ignored',
			},
			{
				label: 'private',
				description:
					'Changes that are private (only visible to owner and reviewers)',
			},
			{
				label: 'wip',
				description: 'Changes that are a work in progress',
			},
			{
				label: 'merge',
				description: 'Changes that are a merge commit',
			},
			{
				label: 'cherrypick',
				description: 'Changes that are a cherrypick of another change',
			},
			{
				label: 'pure-revert',
				description: 'Changes that are pure reverts',
			},
		],
	},
	status: {
		description: 'Changes that have the given status',
		items: [
			{
				label: 'open',
				description: 'Changes that have the state "review in progress"',
			},
			{
				label: 'pending',
				description: 'Changes that have the state "review in progress"',
			},
			{
				label: 'new',
				description: 'Changes that have the state "review in progress"',
			},
			{
				label: 'reviewed',
				description:
					'Changes where any user has commented after the last update from the owner',
			},
			{
				label: 'closed',
				description: 'Changes that are either merged or abandoned',
			},
			{
				label: 'merged',
				description: 'Changes that are merged',
			},
			{
				label: 'abandoned',
				description: 'Changes that are abandoned',
			},
			{
				label: 'closed',
				description: 'Changes that are either merged or abandoned',
			},
		],
	},
	added: {
		description:
			'Changes where the number of lines added satisfies constraint',
		items: [
			{
				label: '>50',
				description: 'More than 50 lines added',
			},
			{
				label: '<50',
				description: 'Less than 50 lines added',
			},
			{
				label: '>=50',
				description: 'More than or exactly 50 lines added',
			},
			{
				label: '>200',
				description: 'More than 200 lines added',
			},
		],
	},
	deleted: {
		description:
			'Changes where the number of lines deleted satisfies constraint',
		items: [
			{
				label: '>50',
				description: 'More than 50 lines deleted',
			},
			{
				label: '<50',
				description: 'Less than 50 lines deleted',
			},
			{
				label: '>=50',
				description: 'More than or exactly 50 lines deleted',
			},
			{
				label: '>200',
				description: 'More than 200 lines deleted',
			},
		],
	},
	delta: {
		description:
			'Changes where the number of lines changed satisfies constraint',
		items: [
			{
				label: '>50',
				description: 'More than 50 lines changed',
			},
			{
				label: '<50',
				description: 'Less than 50 lines changed',
			},
			{
				label: '>=50',
				description: 'More than or exactly 50 lines changed',
			},
			{
				label: '>200',
				description: 'More than 200 lines changed',
			},
		],
	},
	size: {
		description:
			'Changes where the number of lines changed satisfies constraint',
		items: [
			{
				label: '>50',
				description: 'More than 50 lines changed',
			},
			{
				label: '<50',
				description: 'Less than 50 lines changed',
			},
			{
				label: '>=50',
				description: 'More than or exactly 50 lines changed',
			},
			{
				label: '>200',
				description: 'More than 200 lines changed',
			},
		],
	},
	commentby: {
		description: 'Changes where a comment was added by the given user',
		items: userFetcher,
	},
	from: {
		description:
			'Changes that are owned by or have a comment by given user',
		items: userFetcher,
	},
	reviewedby: {
		description:
			'Changes where given user has commented after the last update by the owner',
		items: userFetcher,
	},
	author: {
		description: 'Changes where given user is the author of the patch',
		items: userFetcher,
	},
	committer: {
		description: 'Changes where given user is a committer of the patch',
		items: userFetcher,
	},
	rule: {
		description: 'Changes where given rule\'s status is "OK" or "FORCED"',
	},
	unresolved: {
		description:
			'Changes where the number of unresolved comments satisfies constraint',
		items: [
			{
				label: '>1',
				description: 'More than 1 unresolved comment',
			},
			{
				label: '<10',
				description: 'Less than 10 unresolved comments',
			},
			{
				label: '>=10',
				description: 'More than or exactly 10 unresolved comment',
			},
		],
	},
};

enum QuickPickItemMarker {
	IS_SUBMIT_SEARCH = 'isSubmitSearch',
}

class QuickPickFullEntry implements QuickPickItem {
	public label: string;
	public alwaysShow?: boolean | undefined;
	public description?: string | undefined;
	public detail?: string | undefined;
	public picked?: boolean | undefined;

	public marker: QuickPickItemMarker | null = null;
	public fullEntry: string;

	public constructor({
		label,
		alwaysShow,
		description,
		detail,
		picked,
		marker,
		fullEntry,
	}: QuickPickItem & {
		marker?: QuickPickItemMarker;
		fullEntry?: string;
	}) {
		this.label = label;
		this.alwaysShow = alwaysShow;
		this.description = description;
		this.detail = detail;
		this.picked = picked;

		this.marker = marker ?? null;
		this.fullEntry = fullEntry ?? label;
	}
}

async function getSearchSuggestion(
	currentValue: string
): Promise<QuickPickFullEntry[]> {
	const currentWord = currentValue.split(/\s+/).pop();
	if (!currentWord?.includes(':')) {
		// Search for all filters
		return Object.keys(searchFilterMap).map((searchFilterKey) => {
			return new QuickPickFullEntry({
				label: `${searchFilterKey}:`,
				description: searchFilterMap[searchFilterKey].description,
				alwaysShow: true,
			});
		});
	}

	// User typed `someWord:`, check whether we have a filter for that word
	const [fullSearchFilterKey, searchFilterValue] = currentWord.split(':');
	const searchFilterKey = fullSearchFilterKey.startsWith('-')
		? fullSearchFilterKey.slice(1)
		: fullSearchFilterKey;
	if (!(searchFilterKey in searchFilterMap)) {
		// Not sure what they're typing, just return empty array
		return [];
	}

	const match = searchFilterMap[searchFilterKey];
	if (!match?.items) {
		// No need to suggest anything
		return [];
	} else if (Array.isArray(match.items)) {
		return match.items.map(
			(m) =>
				new QuickPickFullEntry({
					...m,
					alwaysShow: true,
					fullEntry: `${fullSearchFilterKey}:${m.label}`,
				})
		);
	} else {
		return (await match.items(searchFilterValue || '')).map(
			(m) =>
				new QuickPickFullEntry({
					...m,
					alwaysShow: true,
					fullEntry: `${fullSearchFilterKey}:${m.label}`,
				})
		);
	}
}

async function performFiltering(
	results: Promise<QuickPickFullEntry[]>,
	currentValue: string
): Promise<QuickPickFullEntry[]> {
	const values = await results;
	const currentWord = currentValue.split(/\s+/).pop();
	if (!currentWord) {
		return values;
	}
	const filteredWord = currentWord.replace(/"\{\}/g, '');

	return values.filter((v) => v.fullEntry.includes(filteredWord));
}

export function search(): void {
	// const input = window.createInputBox();
	const quickPick = window.createQuickPick();
	const searchButton = {
		tooltip: 'Search current query',
		iconPath: new ThemeIcon('search-view-icon'),
	};
	quickPick.buttons = [searchButton];
	quickPick.canSelectMany = false;
	quickPick.placeholder = 'Search query (supports and autofills filters)';
	quickPick.title = 'Search changes';

	const disposables: Disposable[] = [];
	disposables.push(
		quickPick.onDidHide(() => {
			disposables.forEach((d) => void d.dispose());
		})
	);

	const onSubmit = async (): Promise<void> => {
		const value = quickPick.value;
		quickPick.hide();
		await setContextProp('gerrit:searchQuery', value);
		if (value.length === 0) {
			await window.showInformationMessage('Empty query, not searching');
		} else {
			SearchResultsTreeProvider.clear();
			SearchResultsTreeProvider.refesh();
			SearchResultsTreeProvider.focus();
		}
	};

	/**
	 * When selecting an entry, both `onDidChangeSelection` and
	 * `onDidAccept` are called (in that order). We only want to
	 * truly accept the input value if there are no more selections.
	 * To get around this, we set `didJustChangeSelection` to true,
	 * wait 0ms, and then set it back to false. If `onDidAccept` was
	 * called with it set to true, a selection was made. If it was set
	 * to false, no selection was made and the user just accepted what
	 * was in the input field.
	 */
	let didJustChangeSelection = false;
	disposables.push(
		quickPick.onDidChangeSelection(async (selection) => {
			const entries = selection as readonly QuickPickFullEntry[];
			didJustChangeSelection = true;

			const selectedEntry = entries[0];
			if (selectedEntry) {
				const currentWord = quickPick.value.split(/\s+/).pop();
				if (
					selectedEntry.marker ===
					QuickPickItemMarker.IS_SUBMIT_SEARCH
				) {
					await onSubmit();
				} else {
					const entryStr = selectedEntry.fullEntry.includes(' ')
						? `"${selectedEntry.fullEntry}"`
						: selectedEntry.fullEntry;
					const prefix = currentWord
						? quickPick.value.slice(
								0,
								quickPick.value.lastIndexOf(currentWord)
						  )
						: quickPick.value;
					// Find current word and replace that with full entry
					quickPick.value = `${prefix}${entryStr}${
						selectedEntry.fullEntry.endsWith(':') ? '' : ' '
					}`;
				}
			}
			await wait(0);
			didJustChangeSelection = false;
		})
	);
	disposables.push(
		quickPick.onDidAccept(async () => {
			if (!didJustChangeSelection) {
				await onSubmit();
			}
		})
	);

	const canceledSet: WeakSet<Promise<unknown>> = new WeakSet();
	let lastFetchPromise: Promise<unknown> | undefined = undefined;
	disposables.push(
		quickPick.onDidChangeValue(async () => {
			if (lastFetchPromise) {
				canceledSet.add(lastFetchPromise);
				lastFetchPromise = undefined;
			}

			const query = performFiltering(
				getSearchSuggestion(quickPick.value),
				quickPick.value
			);
			lastFetchPromise = query;

			const result = await query;
			if (!canceledSet.has(query)) {
				quickPick.items = [
					new QuickPickFullEntry({
						alwaysShow: true,
						label: 'Search',
						description: 'Search for current search query',
						marker: QuickPickItemMarker.IS_SUBMIT_SEARCH,
					}),
					...result,
				];
				lastFetchPromise = undefined;
			}
		})
	);

	disposables.push(
		quickPick.onDidTriggerButton(async (button) => {
			if (button === searchButton) {
				await onSubmit();
			}
		})
	);

	quickPick.show();
}

export async function clearSearchResults(): Promise<void> {
	await setContextProp('gerrit:searchQuery', null);
}
