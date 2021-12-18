import {
	DefaultChangeFilter,
	GerritChangeFilter,
} from '../../../lib/gerrit/gerritAPI/filters';
import { CanFetchMoreTreeProvider } from '../shared/canFetchMoreTreeProvider';
import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { TreeItemWithChildren, TreeViewItem } from '../shared/treeTypes';
import { Disposable, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { GerritAPIWith } from '../../../lib/gerrit/gerritAPI/api';
import { optionalArrayEntry } from '../../../lib/util/util';
import { ChangesPanel } from '../../../lib/vscode/config';
import { FetchMoreTreeItem } from './fetchMoreTreeItem';
import { RootTreeViewProvider } from './rootTreeView';
import { ChangeTreeView } from './changeTreeView';
import { log } from '../../../lib/util/log';

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
		public readonly parent: RootTreeViewProvider,
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
					`Status code = ${code ?? '?'}`,
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
		this.parent.root.onDidChangeTreeDataEmitter.fire(this);
	}

	public getRenderedChildren(): ChangeTreeView[] {
		return [...this._fetchedChildren.values()];
	}

	public async getChildren(): Promise<TreeViewItem[]> {
		const changes = await this._fetch(this);
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
