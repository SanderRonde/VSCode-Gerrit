import { GerritChange } from '../../../../lib/gerritAPI/gerritChange';
import { GerritFile } from '../../../../lib/gerritAPI/gerritFile';
import { TreeItemWithoutChildren } from '../../treeTypes';
import { ThemeIcon, TreeItem, Uri } from 'vscode';

export class FileTreeView implements TreeItemWithoutChildren {
	constructor(
		public filePath: string,
		public change: GerritChange,
		public file: GerritFile
	) {}

	async getItem(): Promise<TreeItem> {
		return {
			label: this.filePath,
			contextValue: 'view-online',
			resourceUri: Uri.file(this.file.filePath),
			iconPath: ThemeIcon.File,
		};
	}
}
