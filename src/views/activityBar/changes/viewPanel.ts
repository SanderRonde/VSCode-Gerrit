import {
	DefaultChangeFilter,
	GerritChangeFilter,
} from '../../../lib/gerritAPI/filters';
import { CanFetchMoreTreeProvider } from '../shared/canFetchMoreTreeProvider';
import { Disposable, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { GerritChange } from '../../../lib/gerritAPI/gerritChange';
import { TreeItemWithChildren, TreeViewItem } from '../treeTypes';
import { GerritAPIWith } from '../../../lib/gerritAPI/api';
import { FetchMoreTreeItem } from './fetchMoreTreeItem';
import { optionalArrayEntry } from '../../../lib/util';
import { RootTreeViewProvider } from './rootTreeView';
import { ChangesPanel } from '../../../lib/config';
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

export class ViewPanel
	extends CanFetchMoreTreeProvider
	implements TreeItemWithChildren, Disposable
{
	private _disposables: Disposable[] = [];

	protected _initialLimit: number = this._getDefaultLimit();
	protected _fetchMoreCount: number =
		this._panel.extraEntriesFetchCount ?? 25;

	public constructor(
		private readonly _root: ChangesTreeProvider,
		private readonly _panel: ChangesPanel
	) {
		super();
		if (this._panel.refreshInterval) {
			const interval = setInterval(() => {
				this.refresh();
			}, this._panel.refreshInterval * 1000);
			this._disposables.push({
				dispose: () => clearInterval(interval),
			});
		}
	}

	private _getDefaultLimit(): number {
		return this._panel.initialFetchCount ?? 25;
	}

	private _getFilters(): string[] {
		return this._panel.filters;
	}

	protected _getChanges(
		offset: number,
		count: number
	): Promise<GerritChange[]> {
		return GerritChange.getChanges(
			[
				this._getFilters() as (
					| DefaultChangeFilter
					| GerritChangeFilter
				)[],
			],
			{
				offset,
				count,
			},
			async (code, body): Promise<void> => {
				log(
					`Failed to fetch changes with filters for panel "${this._panel.title}"`,
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

	public refresh(): void {
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
