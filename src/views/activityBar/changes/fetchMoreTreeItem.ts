import { CanFetchMoreTreeProvider } from '../shared/canFetchMoreTreeProvider';
import { GerritExtensionCommands } from '../../../commands/command-names';
import { TreeItemWithoutChildren } from '../shared/treeTypes';
import { Command, ThemeIcon, TreeItem } from 'vscode';

export enum DashboardGroupContainerGroup {
	YOUR_TURN = 'Your Turn',
	WIP = 'Work in progress',
	OUTGOING_REVIEWS = 'Outgoing reviews',
	INCOMING_REVIEWS = 'Incoming reviews',
	CCED_ON = 'CCed on',
	RECENTLY_CLOSED = 'Recently closed',
}

export function fetchMoreTreeItemEntries(
	group: CanFetchMoreTreeProvider
): void {
	group.fetchMore();
}

export class FetchMoreTreeItem implements TreeItemWithoutChildren {
	public constructor(private readonly _parent: CanFetchMoreTreeProvider) {}

	private _getCommand(): Command {
		return {
			command: GerritExtensionCommands.FETCH_MORE,
			title: 'Fetch More',
			arguments: [this._parent],
		};
	}

	public getItem(): Promise<TreeItem> {
		return Promise.resolve({
			label: 'Fetch More',
			iconPath: new ThemeIcon('fold-down'),
			tooltip: 'Fetch more changes',
			command: this._getCommand(),
		});
	}
}
