import { ExtensionContext, TreeDataProvider, TreeItem } from 'vscode';
import { RootTreeViewProvider } from './changes/rootTreeView';
import { TreeViewItem } from './treeTypes';

export class ChangesTreeProvider implements TreeDataProvider<TreeViewItem> {
	constructor(private _context: ExtensionContext) {}

	private _rootViewProvider = new RootTreeViewProvider(this._context);

	async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
		if (!element) {
			return this._rootViewProvider.getChildren();
		}
		return element.getChildren?.() ?? [];
	}

	getTreeItem(element: TreeViewItem): Promise<TreeItem> {
		return element?.getItem();
	}
}
