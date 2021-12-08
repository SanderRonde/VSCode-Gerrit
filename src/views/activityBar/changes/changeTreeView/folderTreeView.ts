import { TreeItemWithoutChildren, TreeViewItem } from '../../shared/treeTypes';
import { GerritChange } from '../../../../lib/gerrit/gerritAPI/gerritChange';
import { ThemeIcon, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { ChangeTreeView, FileMap } from '../changeTreeView';

export class FolderTreeView implements TreeItemWithoutChildren {
	public constructor(
		public folderPath: string,
		public change: GerritChange,
		public fileMap: FileMap,
		public patchsetBase: number | null
	) {}

	public getItem(): TreeItem {
		return {
			label: this.folderPath,
			collapsibleState: TreeItemCollapsibleState.Expanded,
			contextValue: 'folder',
			iconPath: ThemeIcon.Folder,
		};
	}

	public getChildren(): TreeViewItem[] {
		return ChangeTreeView.getFilesAndFolders(
			this.change,
			this.fileMap,
			this.patchsetBase
		);
	}
}
