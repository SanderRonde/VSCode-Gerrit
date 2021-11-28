import { GerritChange } from '../../../../lib/gerritAPI/gerritChange';
import { TreeItemWithoutChildren } from '../../treeTypes';
import { ThemeIcon, TreeItem } from 'vscode';

export class DescriptionTreeView implements TreeItemWithoutChildren {
	public constructor(public change: GerritChange) {}

	public getItem(): TreeItem {
		return {
			label: 'View in webview',
			tooltip: `View change #${this.change._number} in webview`,
			contextValue: 'view-online',
			iconPath: new ThemeIcon('globe'),
		};
	}
}
