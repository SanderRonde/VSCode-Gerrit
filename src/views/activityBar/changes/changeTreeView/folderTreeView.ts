import {
	ChangeTreeView,
	FileMap,
	PatchsetDescription,
} from '../changeTreeView';
import { TreeItemWithoutChildren, TreeViewItem } from '../../shared/treeTypes';
import { GerritChange } from '../../../../lib/gerrit/gerritAPI/gerritChange';
import { ThemeIcon, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { GerritRepo } from '../../../../lib/gerrit/gerritRepo';
import { Data } from '../../../../lib/util/data';

export class FolderTreeView implements TreeItemWithoutChildren {
	public constructor(
		private readonly _gerritRepoD: Data<GerritRepo[]>,
		private readonly _gerritRepo: GerritRepo,
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
			this._gerritRepoD,
			this._gerritRepo,
			this.change,
			this.fileMap,
			this.patchsetBase
		);
	}
}
