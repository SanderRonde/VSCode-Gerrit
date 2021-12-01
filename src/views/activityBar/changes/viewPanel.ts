import {
	DefaultChangeFilter,
	GerritChangeFilter,
} from '../../../lib/gerritAPI/filters';
import { Disposable, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { GerritChange } from '../../../lib/gerritAPI/gerritChange';
import { TreeItemWithChildren, TreeViewItem } from '../treeTypes';
import { GerritAPIWith } from '../../../lib/gerritAPI/api';
import { FetchMoreTreeItem } from './fetchMoreTreeItem';
import { optionalArrayEntry } from '../../../lib/util';
import { RootTreeViewProvider } from './rootTreeView';
import { ChangesPanel } from '../../../lib/config';
import { ChangeTreeView } from './changeTreeView';
import { ChangesTreeProvider } from '../changes';
import { log } from '../../../lib/log';

export enum DashboardGroupContainerGroup {
	YOUR_TURN = 'Your Turn',
	WIP = 'Work in progress',
	OUTGOING_REVIEWS = 'Outgoing reviews',
	INCOMING_REVIEWS = 'Incoming reviews',
	CCED_ON = 'CCed on',
	RECENTLY_CLOSED = 'Recently closed',
}

export class ViewPanel implements TreeItemWithChildren, Disposable {
	private _disposables: Disposable[] = [];

	private _cursor = 0;
	private _limit: number = this._getDefaultLimit();
	private _fetchedChildren: Map<number, ChangeTreeView> = new Map();

	public constructor(
		private readonly _root: ChangesTreeProvider,
		private readonly _panel: ChangesPanel
	) {
		if (this._panel.refreshInterval) {
			const interval = setInterval(() => {
				this.refresh();
			}, this._panel.refreshInterval * 1000);
			this._disposables.push({
				dispose: () => clearInterval(interval),
			});
		}
	}

	private _tryGetChanges(): Promise<GerritChange[]> {
		return GerritChange.getChanges(
			[
				this._getFilters() as (
					| DefaultChangeFilter
					| GerritChangeFilter
				)[],
			],
			{
				offset: this._cursor,
				count: this._limit - this._cursor,
			},
			async (code, body): Promise<void> => {
				log(
					`Failed to fetch changs with filters for panel "${this._panel.title}"`,
					`Status code = ${code}`,
					`response body = "${body}"`
				);
				await RootTreeViewProvider.openConfigSettingsMessage(
					`Failed to fetch changs with filters for panel "${this._panel.title}". Check log for response details`
				);
			},
			GerritAPIWith.DETAILED_ACCOUNTS
		);
	}

	private async _fetch(): Promise<ChangeTreeView[]> {
		const gerritChanges = await this._tryGetChanges();
		if (!gerritChanges) {
			return [];
		}

		const changeViews = gerritChanges.map(
			(change) => new ChangeTreeView(change)
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

	private _getDefaultLimit(): number {
		return this._panel.initialFetchCount ?? 25;
	}

	private _getFilters(): string[] {
		return this._panel.filters;
	}

	public refresh(): void {
		this._root.onDidChangeTreeDataEmitter.fire(this);
	}

	public fetchMore(): void {
		this._limit += this._panel.extraEntriesFetchCount ?? 25;

		this._root.onDidChangeTreeDataEmitter.fire(this);
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

	public getItem(): Promise<TreeItem> {
		return Promise.resolve({
			label: this._panel.title,
			collapsibleState: this._panel.defaultCollapsed
				? TreeItemCollapsibleState.Collapsed
				: TreeItemCollapsibleState.Expanded,
		});
	}

	public dispose(): void {
		this._disposables.forEach((d) => void d.dispose());
	}
}
