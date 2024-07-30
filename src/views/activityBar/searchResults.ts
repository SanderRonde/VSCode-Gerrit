import {
	Disposable,
	Event,
	EventEmitter,
	TreeDataProvider,
	TreeItem,
	TreeView,
	window,
} from 'vscode';
import { CanFetchMoreTreeProvider } from './shared/canFetchMoreTreeProvider';
import { getContextProp, setContextProp } from '../../lib/vscode/context';
import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { showInvalidSettingsMessage } from '../../lib/vscode/messages';
import { Subscribable } from '../../lib/subscriptions/subscriptions';
import { FetchMoreTreeItem } from './changes/fetchMoreTreeItem';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { getAPIForRepo } from '../../lib/gerrit/gerritAPI';
import { GerritRepo } from '../../lib/gerrit/gerritRepo';
import { optionalArrayEntry } from '../../lib/util/util';
import { TreeViewItem } from './shared/treeTypes';
import { Focusable } from './shared/focusable';
import { Clearable } from './shared/clearable';
import { Data } from '../../lib/util/data';
import { log } from '../../lib/util/log';

export class SearchResultsTreeProvider
	extends CanFetchMoreTreeProvider
	implements TreeDataProvider<TreeViewItem>, Disposable, Focusable, Clearable
{
	private static _instance: SearchResultsTreeProvider | null = null;
	private _lastSubscription: Subscribable<GerritChange[]> | null = null;

	private static _currentSearch:
		| {
				repo: GerritRepo;
				query: string;
				type: 'query';
		  }
		| {
				repo: GerritRepo;
				changeNumber: number;
				type: 'changeNumber';
		  }
		| null = null;
	private _lastFocused: string | null = null;

	protected _initialLimit: number = 100;
	protected _fetchMoreCount: number = 100;

	public onDidChangeTreeDataEmitter: EventEmitter<
		TreeViewItem | undefined | null | void
	> = new EventEmitter<TreeViewItem | undefined | null | void>();
	public readonly onDidChangeTreeData: Event<
		TreeViewItem | undefined | null | void
	> = this.onDidChangeTreeDataEmitter.event;

	public treeView!: TreeView<TreeViewItem>;

	public constructor(public readonly gerritReposD: Data<GerritRepo[]>) {
		super('SearchResults');
		SearchResultsTreeProvider._instance = this;
	}

	private static _createSingleItemMapper(
		subscription: Subscribable<GerritChange | null>
	): Subscribable<GerritChange[]> {
		return subscription.mapSubscription((c) => {
			if (c === null) {
				return [];
			}
			return [c];
		});
	}

	public static clear(): void {
		this._instance?.clear();
	}

	public static async refesh(): Promise<void> {
		await this._instance?.refresh();
	}

	public static async focus(): Promise<void> {
		await this._instance?.focus();
	}

	protected async _getChanges(
		offset: number,
		count: number
	): Promise<Subscribable<GerritChange[]> | null> {
		if (!SearchResultsTreeProvider._currentSearch) {
			return null;
		}

		const api = await getAPIForRepo(
			this.gerritReposD,
			SearchResultsTreeProvider._currentSearch.repo
		);
		if (!api) {
			await showInvalidSettingsMessage(
				this.gerritReposD,
				'Failed to perform search due to invalid API settings, please check your settings'
			);
			return null;
		}

		if (SearchResultsTreeProvider._currentSearch.type === 'changeNumber') {
			this.reset();
			const repo = SearchResultsTreeProvider._currentSearch.repo;

			const change = await GerritChange.getChange(this.gerritReposD, {
				changeID: String(
					SearchResultsTreeProvider._currentSearch.changeNumber
				),
				gerritRepo: repo,
			});
			if (!change) {
				await setContextProp('gerrit:searchChangeNumber', null);
				await showInvalidSettingsMessage(
					this.gerritReposD,
					'Failed to find change'
				);
				this.clear();
				return null;
			}

			return SearchResultsTreeProvider._createSingleItemMapper(change);
		}

		const query = SearchResultsTreeProvider._currentSearch.query;
		const subscription = api.searchChanges(
			query,
			{
				offset,
				count,
			},
			(code, body): void => {
				const queryFailMsg = `Failed to perform search with query "${query}"`;
				log(
					queryFailMsg,
					`Status code = ${code ?? '?'}`,
					`response body = "${body}"`
				);
				void window.showErrorMessage(queryFailMsg);
			},
			GerritAPIWith.DETAILED_ACCOUNTS
		);
		this._lastSubscription = subscription;
		return subscription;
	}

	public static setCurrent(
		currentSearch:
			| {
					repo: GerritRepo;
					query: string;
					type: 'query';
			  }
			| {
					repo: GerritRepo;
					changeNumber: number;
					type: 'changeNumber';
			  }
	): void {
		const lastSearch = SearchResultsTreeProvider._currentSearch;
		SearchResultsTreeProvider._currentSearch = currentSearch;
		if (!lastSearch) {
			this._instance?.reset();
			return;
		}
		if (lastSearch.type !== currentSearch.type) {
			this._instance?.reset();
			return;
		}
		if (
			(lastSearch.type === 'query' &&
				lastSearch.query !==
					(currentSearch as { query: string }).query) ||
			(lastSearch.type === 'changeNumber' &&
				lastSearch.changeNumber !==
					(currentSearch as { changeNumber: number }).changeNumber)
		) {
			this._instance?.reset();
			return;
		}
	}

	public clear(): void {
		this.reset();
		SearchResultsTreeProvider._currentSearch = null;
		this._lastFocused = null;
	}

	public reload(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	public async refresh(): Promise<void> {
		await this._lastSubscription?.invalidate();
		this.onDidChangeTreeDataEmitter.fire();
	}

	// We need to implement this but it'll always return the root
	// so no need to implement anything
	public getParent(): undefined {
		return undefined;
	}

	public async focus(): Promise<void> {
		// @ts-expect-error Secret API but you can just pass undefined to this and it works...
		await this.treeView.reveal(undefined, {
			select: false,
			focus: true,
		});
	}

	public async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
		if (element) {
			if (!element.getChildren) {
				return [];
			}
			return element.getChildren();
		}

		const changes = await this._fetch(this);
		const hasMore =
			changes.length > 0 &&
			changes[changes.length - 1].change.moreChanges;

		if (getContextProp('gerrit:searchChangeNumber')) {
			// Only focus once per search result
			if (this._lastFocused !== changes[0].change.changeID) {
				setTimeout(() => {
					void this.treeView.reveal(changes[0].treeView, {
						expand: true,
						focus: true,
						select: true,
					});
				}, 50);
				this._lastFocused = changes[0].change.changeID;
			}
		} else {
			this._lastFocused = null;
		}

		return [
			...changes.map((c) => c.treeView),
			...optionalArrayEntry(hasMore, () => new FetchMoreTreeItem(this)),
		];
	}

	public async getTreeItem(element: TreeViewItem): Promise<TreeItem> {
		return await element.getItem();
	}

	public dispose(): void {
		SearchResultsTreeProvider._instance = null;
		this._disposables.forEach((d) => void d.dispose());
	}
}
