import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { ChangeTreeView } from '../changes/changeTreeView';
import { Refreshable } from './refreshable';

export abstract class CanFetchMoreTreeProvider implements Refreshable {
	private _cursor = 0;
	private _limit: number | null = null;
	protected _fetchedChildren: Map<number, ChangeTreeView> = new Map();
	protected abstract get _initialLimit(): number;
	protected abstract get _fetchMoreCount(): number;

	protected abstract _getChanges(
		offset: number,
		count: number
	): Promise<GerritChange[]>;

	protected async _fetch(): Promise<ChangeTreeView[]> {
		if (this._limit === null) {
			this._limit = this._initialLimit;
		}

		const changes = await this._getChanges(
			this._cursor,
			this._limit - this._cursor
		);

		const changeViews = changes.map((change) => new ChangeTreeView(change));
		for (let i = this._cursor; i < this._limit; i++) {
			this._fetchedChildren.set(i, changeViews[i - this._cursor]);
		}

		this._cursor += changeViews.length;
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
