import {
	age,
	DefaultChangeFilter,
	filterOr,
	GerritChangeFilter,
	invert,
} from '../../../lib/gerritAPI/filters';
import { DashboardGroupContainerLike } from './dashboardGroupContainerLike';
import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { TreeItemWithChildren } from '../treeTypes';

export enum DashboardGroupContainerGroup {
	YOUR_TURN = 'Your Turn',
	WIP = 'Work in progress',
	OUTGOING_REVIEWS = 'Outgoing reviews',
	INCOMING_REVIEWS = 'Incoming reviews',
	CCED_ON = 'CCed on',
	RECENTLY_CLOSED = 'Recently closed',
}

export class DashboardGroupContainer
	extends DashboardGroupContainerLike
	implements TreeItemWithChildren
{
	constructor(
		private _groupName: DashboardGroupContainerGroup,
		private _collapsibleState: TreeItemCollapsibleState
	) {
		super();
	}

	getItem(): Promise<TreeItem> {
		return Promise.resolve({
			label: this._groupName,
			collapsibleState: this._collapsibleState,
		});
	}

	getDefaultLimit() {
		if (this._groupName === DashboardGroupContainerGroup.RECENTLY_CLOSED) {
			return 10;
		}
		return 25;
	}

	getFilters(): (DefaultChangeFilter | GerritChangeFilter)[] {
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
					invert(age('4w')),
				];
		}
	}
}
