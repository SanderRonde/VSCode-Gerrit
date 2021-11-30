import {
	DashboardGroupContainer,
	DashboardGroupContainerGroup,
} from './dashboardGroupContainer';
import {
	DefaultChangeFilter,
	GerritChangeFilter,
	limit,
} from '../../../lib/gerritAPI/filters';
import { ExtensionContext, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { DashboardGroupContainerLike } from './dashboardGroupContainerLike';
import { GerritChangesView, getConfiguration } from '../../../lib/config';
import { TreeItemWithChildren, TreeViewItem } from '../treeTypes';
import { storageGet, StorageScope } from '../../../lib/storage';
import { ChangesTreeProvider } from '../changes';

export class RootTreeViewProvider
	extends DashboardGroupContainerLike
	implements TreeItemWithChildren
{
	public constructor(
		protected override readonly _root: ChangesTreeProvider,
		private readonly _context: ExtensionContext
	) {
		super(_root, true);
	}

	private _getCollapseState(
		shouldBeCollapsed: boolean
	): TreeItemCollapsibleState {
		if (shouldBeCollapsed) {
			return TreeItemCollapsibleState.Collapsed;
		} else {
			return TreeItemCollapsibleState.Expanded;
		}
	}

	private _getDashboard(): DashboardGroupContainer[] {
		return [
			new DashboardGroupContainer(
				this._root,
				DashboardGroupContainerGroup.YOUR_TURN,
				this._getCollapseState(
					storageGet(
						this._context,
						'activityBar.changes.yourTurn.collapsed',
						StorageScope.GLOBAL,
						false
					)
				)
			),
			new DashboardGroupContainer(
				this._root,
				DashboardGroupContainerGroup.WIP,
				this._getCollapseState(
					storageGet(
						this._context,
						'activityBar.changes.wip.collapsed',
						StorageScope.GLOBAL,
						false
					)
				)
			),
			new DashboardGroupContainer(
				this._root,
				DashboardGroupContainerGroup.OUTGOING_REVIEWS,
				this._getCollapseState(
					storageGet(
						this._context,
						'activityBar.changes.outgoing.collapsed',
						StorageScope.GLOBAL,
						false
					)
				)
			),
			new DashboardGroupContainer(
				this._root,
				DashboardGroupContainerGroup.INCOMING_REVIEWS,
				this._getCollapseState(
					storageGet(
						this._context,
						'activityBar.changes.incoming.collapsed',
						StorageScope.GLOBAL,
						false
					)
				)
			),
			new DashboardGroupContainer(
				this._root,
				DashboardGroupContainerGroup.CCED_ON,
				this._getCollapseState(
					storageGet(
						this._context,
						'activityBar.changes.cced.collapsed',
						StorageScope.GLOBAL,
						false
					)
				)
			),
			new DashboardGroupContainer(
				this._root,
				DashboardGroupContainerGroup.RECENTLY_CLOSED,
				this._getCollapseState(
					storageGet(
						this._context,
						'activityBar.changes.recentlyClosed.collapsed',
						StorageScope.GLOBAL,
						true
					)
				)
			),
		];
	}

	public getItem(): Promise<TreeItem> {
		return Promise.resolve({});
	}

	public getDefaultLimit(): number {
		return 25;
	}

	public getFilters(): (DefaultChangeFilter | GerritChangeFilter)[] {
		switch (
			getConfiguration().get(
				'gerrit.changesView',
				GerritChangesView.DASHBOARD
			)
		) {
			case GerritChangesView.STARRED:
				return [DefaultChangeFilter.IS_STARRED, limit(25)];
			case GerritChangesView.WATCHED:
				return [
					DefaultChangeFilter.IS_WATCHED,
					DefaultChangeFilter.IS_OPEN,
					limit(25),
				];
			case GerritChangesView.DRAFT:
				return [DefaultChangeFilter.HAS_DRAFT, limit(25)];
			case GerritChangesView.MY_CHANGES:
				return [
					DefaultChangeFilter.IS_OPEN,
					DefaultChangeFilter.OWNER_SELF,
					limit(25),
				];
		}
		return [];
	}

	public override async getChildren(): Promise<TreeViewItem[]> {
		const config = getConfiguration().get(
			'gerrit.changesView',
			GerritChangesView.DASHBOARD
		);
		if (config === GerritChangesView.DASHBOARD) {
			return this._getDashboard();
		}

		return super.getChildren();
	}
}
