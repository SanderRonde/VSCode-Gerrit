import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { ChangeTreeView } from '../changes/changeTreeView';
import { ViewPanel } from '../changes/viewPanel';
import { Refreshable } from './refreshable';
import { ExtensionContext } from 'vscode';

export abstract class CanFetchMoreTreeProvider implements Refreshable {
	private _cursor = 0;
	private _limit: number | null = null;
	protected _fetchedChildren: Map<number, ChangeTreeView> = new Map();
	protected abstract get _initialLimit(): number;
	protected abstract get _fetchMoreCount(): number;

	public constructor(private readonly _context: ExtensionContext) {}

	protected abstract _getChanges(
		offset: number,
		count: number
	): Promise<GerritChange[]>;

	protected async _fetch(panel?: ViewPanel): Promise<ChangeTreeView[]> {
		if (this._limit === null) {
			this._limit = this._initialLimit;
		}

		const changes = await this._getChanges(
			this._cursor,
			this._limit - this._cursor
		);

		const changeViews = changes.map(
			(change) => new ChangeTreeView(this._context, change, panel ?? null)
		);
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
