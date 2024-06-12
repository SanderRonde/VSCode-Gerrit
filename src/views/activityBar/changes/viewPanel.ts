import {
	DefaultChangeFilter,
	GerritChangeFilter,
} from '../../../lib/gerrit/gerritAPI/filters';
import { CanFetchMoreTreeProvider } from '../shared/canFetchMoreTreeProvider';
import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { TreeItemWithChildren, TreeViewItem } from '../shared/treeTypes';
import { Subscribable } from '../../../lib/subscriptions/subscriptions';
import { Disposable, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { ChangeTreeView, PatchsetDescription } from './changeTreeView';
import { GerritAPIWith } from '../../../lib/gerrit/gerritAPI/api';
import { Repository } from '../../../types/vscode-extension-git';
import { optionalArrayEntry } from '../../../lib/util/util';
import { ChangesPanel } from '../../../lib/vscode/config';
import { FetchMoreTreeItem } from './fetchMoreTreeItem';
import { RootTreeViewProvider } from './rootTreeView';
import { Refreshable } from '../shared/refreshable';
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
	implements TreeItemWithChildren
{
	private _lastSubscription: Subscribable<GerritChange[]> | null = null;
	protected _initialLimit: number = this._getDefaultLimit();
	protected _fetchMoreCount: number =
		this._panel.extraEntriesFetchCount ?? 25;

	public patchsetsForChange: Map<
		string,
		{
			patchSetBase: PatchsetDescription | null;
			patchSetCurrent: PatchsetDescription | null;
		}
	> = new Map();

	public constructor(
		protected readonly _gerritRepo: Repository,
		public readonly parent: RootTreeViewProvider,
		private readonly _panel: ChangesPanel
	) {
		super(`ViewPanel.${_panel.title}`);
		if (this._panel.refreshInterval) {
			ViewPanel.registerWeakInterval(
				new WeakRef(this),
				this._panel.refreshInterval * 1000,
				this._disposables
			);
		}
	}

	private static _createErrorLogger(
		panelTitle: string
	): (code: number | undefined, body: string) => Promise<void> {
		return async (code, body): Promise<void> => {
			log(
				`Failed to fetch changes with filters for panel "${panelTitle}"`,
				`Status code = ${code ?? '?'}`,
				`response body = "${body}"`
			);
			await RootTreeViewProvider.openConfigSettingsMessage(
				`Failed to fetch changs with filters for panel "${panelTitle}". Check log for response details`
			);
		};
	}

	public static registerWeakInterval(
		weakSelf: WeakRef<Refreshable>,
		time: number,
		disposables: Disposable[]
	): void {
		const interval = setInterval(() => {
			void weakSelf.deref()?.refresh();
		}, time);
		disposables.push({
			dispose: () => clearInterval(interval),
		});
	}

	private _getDefaultLimit(): number {
		return this._panel.initialFetchCount ?? 25;
	}

	private _getFilters(): string[] {
		return this._panel.filters;
	}

	protected async _getChanges(
		offset: number,
		count: number
	): Promise<Subscribable<GerritChange[]> | null> {
		const subscription = await GerritChange.getChanges(
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
			ViewPanel._createErrorLogger(this._panel.title),
			GerritAPIWith.DETAILED_ACCOUNTS
		);
		this._lastSubscription = subscription;
		if (!subscription) {
			return null;
		}
		this._disposables.push(subscription.disposable);
		return subscription;
	}

	public reload(): void {
		this.parent.root.onDidChangeTreeDataEmitter.fire(this);
	}

	public async refresh(): Promise<void> {
		if (this._lastSubscription) {
			await this._lastSubscription.invalidate();
		}
		this.reload();
	}

	public async getRenderedChildren(): Promise<ChangeTreeView[]> {
		return (await this._getAllChangeTreeViews()).map((c) => c.treeView);
	}

	public async getChildren(): Promise<TreeViewItem[]> {
		const changes = await this._fetch(this);
		const hasMore =
			changes.length > 0 &&
			changes[changes.length - 1].change.moreChanges;
		return [
			...changes.map((c) => c.treeView),
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
}
