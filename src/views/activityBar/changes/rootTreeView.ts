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
import { storageGet, StorageScope } from '../../../lib/storage';
import { TreeItemWithChildren } from '../treeTypes';

export class RootTreeViewProvider
	extends DashboardGroupContainerLike
	implements TreeItemWithChildren
{
	public constructor(private _context: ExtensionContext) {
		super();
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

	public async getChildren(): Promise<TreeItemWithChildren[]> {
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
