import { GerritChange } from '../../../../lib/gerritAPI/gerritChange';
import { TreeItemWithoutChildren } from '../../treeTypes';
import { ThemeIcon, TreeItem } from 'vscode';

export class DescriptionTreeView implements TreeItemWithoutChildren {
	constructor(public change: GerritChange) {}

	async getItem(): Promise<TreeItem> {
		return {
			label: 'See in webview',
			tooltip: `View change #${this.change._number} in webview`,
			contextValue: 'view-online',
			iconPath: new ThemeIcon('comment-discussion'),
		};
	}
}
