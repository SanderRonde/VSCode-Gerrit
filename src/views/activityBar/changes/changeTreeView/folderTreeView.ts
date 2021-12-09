import {
	ChangeTreeView,
	FileMap,
	PatchsetDescription,
} from '../changeTreeView';
import { TreeItemWithoutChildren, TreeViewItem } from '../../shared/treeTypes';
import { GerritChange } from '../../../../lib/gerrit/gerritAPI/gerritChange';
import { ThemeIcon, TreeItem, TreeItemCollapsibleState } from 'vscode';

export class FolderTreeView implements TreeItemWithoutChildren {
	public constructor(
		public folderPath: string,
		public change: GerritChange,
		public fileMap: FileMap,
		public patchsetBase: PatchsetDescription | null
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
