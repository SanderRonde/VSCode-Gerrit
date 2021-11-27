import { ExtensionContext, TreeDataProvider, TreeItem } from 'vscode';
import { RootTreeViewProvider } from './changes/rootTreeView';
import { TreeViewItem } from './treeTypes';

export class ChangesTreeProvider implements TreeDataProvider<TreeViewItem> {
	public constructor(private _context: ExtensionContext) {}

	private _rootViewProvider = new RootTreeViewProvider(this._context);

	public async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
		if (!element) {
			return this._rootViewProvider.getChildren();
		}
		return element.getChildren?.() ?? [];
	}

	public async getTreeItem(element: TreeViewItem): Promise<TreeItem> {
		return await element.getItem();
	}
}
