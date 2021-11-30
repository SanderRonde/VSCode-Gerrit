import {
	DefaultChangeFilter,
	GerritChangeFilter,
	offset,
	limit,
} from '../../../lib/gerritAPI/filters';
import { GerritChange } from '../../../lib/gerritAPI/gerritChange';
import { TreeItemWithChildren, TreeViewItem } from '../treeTypes';
import { GerritAPIWith } from '../../../lib/gerritAPI/api';
import { FetchMoreTreeItem } from './fetchMoreTreeItem';
import { Event, EventEmitter, TreeItem } from 'vscode';
import { optionalArrayEntry } from '../../../lib/util';
import { ChangeTreeView } from './changeTreeView';
import { ChangesTreeProvider } from '../changes';

export abstract class DashboardGroupContainerLike
	implements TreeItemWithChildren
{
	/**
	 * By howmuch to up the cursor when clicking "fetch more"
	 */
	private static readonly _UP_COUNT = 25;

	private _onDidChangeTreeData: EventEmitter<
		DashboardGroupContainerLike | undefined | null | void
	> = new EventEmitter<
		DashboardGroupContainerLike | undefined | null | void
	>();

	private _cursor = 0;
	private _limit: number = this.getDefaultLimit();
	private _fetchedChildren: Map<number, ChangeTreeView> = new Map();

	public readonly onDidChangeTreeData: Event<
		DashboardGroupContainerLike | undefined | null | void
	> = this._onDidChangeTreeData.event;

	public constructor(
		protected readonly _root: ChangesTreeProvider,
		private readonly _isRoot: boolean
	) {}

	private async _fetch(): Promise<ChangeTreeView[]> {
		console.log([offset(this._cursor), limit(this._limit - this._cursor)]);
		const changes = await Promise.all(
			(
				await GerritChange.getChanges(
					[this.getFilters()],
					{
						offset: this._cursor,
						count: this._limit - this._cursor,
					},
					GerritAPIWith.DETAILED_ACCOUNTS
				)
			).map((change) => new ChangeTreeView(change))
		);
		for (let i = this._cursor; i < this._limit; i++) {
			this._fetchedChildren.set(i, changes[i - this._cursor]);
		}

		this._cursor += changes.length;
		const entries: ChangeTreeView[] = [];
		for (let i = 0; i < this._limit; i++) {
			const entry = this._fetchedChildren.get(i);
			if (entry) {
				entries.push(entry);
			}
		}
		return entries;
	}

	protected abstract getFilters(): (
		| DefaultChangeFilter
		| GerritChangeFilter
	)[];
	protected abstract getDefaultLimit(): number;

	public abstract getItem(): Promise<TreeItem>;

	public refresh(): void {
		// TODO: add "refresh" button
		this._root.onDidChangeTreeDataEmitter.fire(
			this._isRoot ? undefined : this
		);
	}

	public fetchMore(): void {
		this._limit += DashboardGroupContainerLike._UP_COUNT;

		this._root.onDidChangeTreeDataEmitter.fire(
			this._isRoot ? undefined : this
		);
	}

	public async getChildren(): Promise<TreeViewItem[]> {
		const changes = await this._fetch();
		const hasMore =
			changes.length > 0 &&
			changes[changes.length - 1].change.moreChanges;
		return [
			...changes,
			...optionalArrayEntry(hasMore, () => new FetchMoreTreeItem(this)),
		];
	}
}
