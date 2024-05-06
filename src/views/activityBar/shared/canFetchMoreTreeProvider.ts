import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { Subscribable } from '../../../lib/subscriptions/subscriptions';
import { SelfDisposable } from '../../../lib/util/selfDisposable';
import { Repository } from '../../../types/vscode-extension-git';
import { SearchResultsTreeProvider } from '../searchResults';
import { ChangeTreeView } from '../changes/changeTreeView';
import { Refreshable, Reloadable } from './refreshable';
import { uniqueSimple } from '../../../lib/util/util';
import { ViewPanel } from '../changes/viewPanel';

export abstract class CanFetchMoreTreeProvider
	extends SelfDisposable
	implements Refreshable, Reloadable
{
	private _cursor = 0;
	private _limit: number | null = null;
	protected _changeToTreeView: WeakMap<GerritChange, ChangeTreeView> =
		new WeakMap();
	protected _fetchedChildren: Map<
		number,
		{
			offset: number;
			subscription: Subscribable<GerritChange[]>;
		}
	> = new Map();
	protected abstract get _initialLimit(): number;
	protected abstract get _fetchMoreCount(): number;
	// Needs to be a getter since prettier doesn't understand abstract properties
	protected abstract get _gerritRepo(): Repository;

	protected constructor(description: string) {
		super(description);
	}

	protected abstract _getChanges(
		offset: number,
		count: number
	): Promise<Subscribable<GerritChange[]> | null>;

	protected async _getAllChangeTreeViews(
		parent?: ViewPanel | SearchResultsTreeProvider
	): Promise<
		{
			treeView: ChangeTreeView;
			change: GerritChange;
		}[]
	> {
		if (!this._limit) {
			return [];
		}
		const entries: {
			treeView: ChangeTreeView;
			change: GerritChange;
		}[] = [];
		for (let i = 0; i < this._limit; i++) {
			if (!this._fetchedChildren.has(i)) {
				continue;
			}
			const entry = (
				await this._fetchedChildren.get(i)!.subscription.getValue()
			)[this._fetchedChildren.get(i)!.offset];

			if (!entry) {
				continue;
			}

			if (!this._changeToTreeView.has(entry)) {
				if (parent) {
					this._changeToTreeView.set(
						entry,
						await ChangeTreeView.create(
							this._gerritRepo,
							entry.changeID,
							parent
						)
					);
				} else {
					continue;
				}
			}
			entries.push({
				change: entry,
				treeView: this._changeToTreeView.get(entry)!,
			});
		}
		return entries;
	}
	protected async _fetch(
		parent: ViewPanel | SearchResultsTreeProvider
	): Promise<
		{
			treeView: ChangeTreeView;
			change: GerritChange;
		}[]
	> {
		if (this._limit === null) {
			this._limit = this._initialLimit;
		}

		const subscription = await this._getChanges(
			this._cursor,
			this._limit - this._cursor
		);

		if (subscription) {
			const fetched = await subscription.getValue();
			subscription.subscribe(new WeakRef(() => this.reload()));

			// Register new subscriber
			for (
				let i = this._cursor;
				i < Math.min(this._limit, this._cursor + fetched.length);
				i++
			) {
				this._fetchedChildren.set(i, {
					subscription,
					offset: i - this._cursor,
				});
			}
			this._cursor += fetched.length;
		}

		// Pre-fetch all values at the same time
		await Promise.all(
			uniqueSimple(
				[...this._fetchedChildren.values()].map((x) => x.subscription)
			).map((s) => s.getValue())
		);

		return this._getAllChangeTreeViews(parent);
	}

	protected _reset(): void {
		this._cursor = 0;
		this._limit = this._initialLimit;
		uniqueSimple(
			[...this._fetchedChildren.values()].map((c) => c.subscription)
		).forEach((s) => s.unsubscribe());
		this._fetchedChildren.clear();
	}

	public abstract refresh(): void;
	public abstract reload(): void;

	public fetchMore(): void {
		this._limit ??= 0;
		this._limit += this._fetchMoreCount;

		this.refresh();
	}
}
