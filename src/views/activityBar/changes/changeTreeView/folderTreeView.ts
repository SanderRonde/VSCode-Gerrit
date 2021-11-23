import { TreeItemWithoutChildren, TreeViewItem } from '../../treeTypes';
import { ThemeIcon, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { GerritChange } from '../../../../lib/gerritAPI/gerritChange';
import { ChangeTreeView, FileMap } from '../changeTreeView';

export class FolderTreeView implements TreeItemWithoutChildren {
	constructor(public folderPath: string, public change: GerritChange, public fileMap: FileMap) {}

	async getItem(): Promise<TreeItem> {
		return {
			label: this.folderPath,
			collapsibleState: TreeItemCollapsibleState.Expanded,
			contextValue: 'folder',
			iconPath: ThemeIcon.Folder,
		};
	}

	async getChildren(): Promise<TreeViewItem[]> {
		return ChangeTreeView.getFilesAndFolders(this.change, this.fileMap);
	}
}
