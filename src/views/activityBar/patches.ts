import {
	ExtensionContext,
	ThemeIcon,
	TreeDataProvider,
	TreeItem,
	TreeItemCollapsibleState,
} from 'vscode';
import {
	DefaultChangeFilter,
	filterOr,
	GerritAPIWith,
	GerritChange,
} from '../../lib/gerritAPI';
import { GerritPatchesView, getConfiguration } from '../../lib/config';
import { storageGet, StorageScope } from '../../lib/storage';
import { GerritDetailedUser } from '../../types/gerritAPI';
import { getChanges } from '../../lib/gerrit';

type PatchTreeEntry = ChangeTreeView;

interface TreeItemWithChildren {
	getChildren(): Promise<TreeItemWithChildren[]>;
}

export class PatchesTreeProvider implements TreeDataProvider<PatchTreeEntry> {
	constructor(private _context: ExtensionContext) {}

	private _rootViewProvider = new RootViewProvider(this._context);

	async getChildren(element?: PatchTreeEntry): Promise<PatchTreeEntry[]> {
		if (!element) {
			return this._rootViewProvider.getChildren();
		}
		return element.getChildren();
	}

	getTreeItem(element: PatchTreeEntry): PatchTreeEntry {
		return element;
	}
}

enum DashboardGroupContainerGroup {
	YOUR_TURN = 'Your Turn',
	WIP = 'Work in progress',
	OUTGOING_REVIEWS = 'Outgoing reviews',
	INCOMING_REVIEWS = 'Incoming reviews',
	CCED_ON = 'CCed on',
	RECENTLY_CLOSED = 'Recently closed',
}

class DashboardGroupContainer extends TreeItem implements TreeItemWithChildren {
	constructor(
		private _groupName: DashboardGroupContainerGroup,
		collapsibleState: TreeItemCollapsibleState
	) {
		super(_groupName, collapsibleState);
	}

	async getChildren(): Promise<ChangeTreeView[]> {
		const filters = (() => {
			switch (this._groupName) {
				case DashboardGroupContainerGroup.YOUR_TURN:
					return [DefaultChangeFilter.ATTENTION_SELF];
				case DashboardGroupContainerGroup.WIP:
					return [
						DefaultChangeFilter.IS_OPEN,
						DefaultChangeFilter.OWNER_SELF,
						DefaultChangeFilter.IS_WIP,
					];
				case DashboardGroupContainerGroup.OUTGOING_REVIEWS:
					return [
						DefaultChangeFilter.IS_OPEN,
						DefaultChangeFilter.OWNER_SELF,
						DefaultChangeFilter.NOT_IS_WIP,
						DefaultChangeFilter.NOT_IS_IGNORED,
					];
				case DashboardGroupContainerGroup.INCOMING_REVIEWS:
					return [
						DefaultChangeFilter.IS_OPEN,
						DefaultChangeFilter.NOT_OWNER_SELF,
						DefaultChangeFilter.NOT_IS_WIP,
						DefaultChangeFilter.NOT_IS_IGNORED,
						filterOr(
							DefaultChangeFilter.REVIEWER_SELF,
							DefaultChangeFilter.ASSIGNEE_SELF
						),
					];
				case DashboardGroupContainerGroup.CCED_ON:
					return [
						DefaultChangeFilter.IS_OPEN,
						DefaultChangeFilter.NOT_IS_IGNORED,
						DefaultChangeFilter.CC_SELF,
					];
				case DashboardGroupContainerGroup.RECENTLY_CLOSED:
					return [
						DefaultChangeFilter.IS_CLOSED,
						DefaultChangeFilter.NOT_IS_IGNORED,
						filterOr(
							DefaultChangeFilter.NOT_IS_WIP,
							DefaultChangeFilter.OWNER_SELF
						),
						filterOr(
							DefaultChangeFilter.OWNER_SELF,
							DefaultChangeFilter.REVIEWER_SELF,
							DefaultChangeFilter.ASSIGNEE_SELF,
							DefaultChangeFilter.CC_SELF
						),
					];
			}
		})();
		return Promise.all(
			(await getChanges([filters], GerritAPIWith.DETAILED_ACCOUNTS)).map(
				(change) => createChangeTreeView(change)
			)
		);
	}
}

class RootViewProvider implements TreeItemWithChildren {
	constructor(private _context: ExtensionContext) {}

	private _getCollapseState(shouldBeCollapsed: boolean) {
		if (shouldBeCollapsed) {
			return TreeItemCollapsibleState.Collapsed;
		} else {
			return TreeItemCollapsibleState.Expanded;
		}
	}

	private async _getDashboard(): Promise<DashboardGroupContainer[]> {
		return [
			new DashboardGroupContainer(
				DashboardGroupContainerGroup.YOUR_TURN,
				this._getCollapseState(
					storageGet(
						this._context,
						'activityBar.patches.yourTurn.collapsed',
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
						'activityBar.patches.wip.collapsed',
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
						'activityBar.patches.outgoing.collapsed',
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
						'activityBar.patches.incoming.collapsed',
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
						'activityBar.patches.cced.collapsed',
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
						'activityBar.patches.recentlyClosed.collapsed',
						StorageScope.GLOBAL,
						true
					)
				)
			),
		];
	}

	async getChildren(): Promise<(ChangeTreeView | DashboardGroupContainer)[]> {
		const config = getConfiguration().get(
			'gerrit.patchesView',
			GerritPatchesView.DASHBOARD
		);
		if (config === GerritPatchesView.DASHBOARD) {
			return this._getDashboard();
		}

		const filters = (() => {
			switch (config) {
				case GerritPatchesView.STARRED:
					return [DefaultChangeFilter.IS_STARRED];
				case GerritPatchesView.WATCHED:
					return [
						DefaultChangeFilter.IS_WATCHED,
						DefaultChangeFilter.IS_OPEN,
					];
				case GerritPatchesView.DRAFT:
					return [DefaultChangeFilter.HAS_DRAFT];
				case GerritPatchesView.MY_CHANGES:
					return [
						DefaultChangeFilter.IS_OPEN,
						DefaultChangeFilter.OWNER_SELF,
					];
			}
		})();

		return Promise.all(
			(await getChanges([filters], GerritAPIWith.DETAILED_ACCOUNTS)).map(
				(change) => createChangeTreeView(change)
			)
		);
	}
}

async function createChangeTreeView(change: GerritChange) {
	// All we're really doing here is handlign the async stuff upfront
	const owner = await change.detailedOwner;
	return new ChangeTreeView(change, owner);
}

class ChangeTreeView extends TreeItem implements TreeItemWithChildren {
	constructor(change: GerritChange, owner: GerritDetailedUser | null) {
		const changeNumber = `#${change._number}`;
		super(
			{
				label: `${changeNumber}: ${change.subject}`,
			},
			TreeItemCollapsibleState.Collapsed
		);

		if (owner) {
			this.description = `by ${owner.display_name || owner.name}`;
		}
		this.tooltip = change.subject;
		this.contextValue = 'change';
		this.iconPath = new ThemeIcon('git-pull-request');
	}

	async getChildren(): Promise<any[]> {
		// TODO:
		return [];
	}
}
