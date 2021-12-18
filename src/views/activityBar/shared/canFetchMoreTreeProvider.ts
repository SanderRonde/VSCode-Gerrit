import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { SearchResultsTreeProvider } from '../searchResults';
import { ChangeTreeView } from '../changes/changeTreeView';
import { CacheContainer } from '../../../lib/util/cache';
import { ViewPanel } from '../changes/viewPanel';
import { Refreshable } from './refreshable';

export abstract class CanFetchMoreTreeProvider implements Refreshable {
	private _cursor = 0;
	private _limit: number | null = null;
	protected _fetchedChildren: CacheContainer<number, ChangeTreeView> =
		new CacheContainer();
	protected abstract get _initialLimit(): number;
	protected abstract get _fetchMoreCount(): number;

	protected abstract _getChanges(
		offset: number,
		count: number
	): Promise<GerritChange[]>;

	protected async _fetch(
		parent: ViewPanel | SearchResultsTreeProvider
	): Promise<ChangeTreeView[]> {
		if (this._limit === null) {
			this._limit = this._initialLimit;
		}

		// Doublecheck cursor
		let cursor = 0;
		for (
			let i = 0;
			i < Math.min(this._fetchedChildren.size, this._cursor);
			i++
		) {
			if (this._fetchedChildren.has(i)) {
				cursor++;
			}
		}

		const changes = await this._getChanges(cursor, this._limit - cursor);

		const changeViews = changes.map(
			(change) => new ChangeTreeView(change, parent)
		);
		for (
			let i = cursor;
			i < Math.min(this._limit, cursor + changeViews.length);
			i++
		) {
			this._fetchedChildren.set(i, changeViews[i - cursor]);
		}

		this._cursor = this._limit;
		const entries: ChangeTreeView[] = [];
		for (let i = 0; i < this._limit; i++) {
			const entry = this._fetchedChildren.get(i);
			if (entry) {
				entries.push(entry);
			}
		}
		return entries;
	}

	protected _reset(): void {
		this._cursor = 0;
		this._limit = this._initialLimit;
		this._fetchedChildren.clear();
	}

	public abstract refresh(): void;

	public fetchMore(): void {
		this._limit ??= 0;
		this._limit += this._fetchMoreCount;

		this.refresh();
	}
}
