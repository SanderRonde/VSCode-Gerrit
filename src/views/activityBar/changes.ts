import {
	Disposable,
	Event,
	EventEmitter,
	ExtensionContext,
	TreeDataProvider,
	TreeItem,
} from 'vscode';
import { PERIODICAL_CHANGE_FETCH_INTERVAL } from '../../lib/util/constants';
import { RootTreeViewProvider } from './changes/rootTreeView';
import { TreeViewItem } from './shared/treeTypes';

export class ChangesTreeProvider
	implements TreeDataProvider<TreeViewItem>, Disposable
{
	private static _instances: Set<ChangesTreeProvider> = new Set();
	private _disposables: Disposable[] = [];
	private _rootViewProvider = new RootTreeViewProvider(this._context, this);

	public onDidChangeTreeDataEmitter: EventEmitter<
		TreeViewItem | undefined | null | void
	> = new EventEmitter<TreeViewItem | undefined | null | void>();
	public readonly onDidChangeTreeData: Event<
		TreeViewItem | undefined | null | void
	> = this.onDidChangeTreeDataEmitter.event;

	public constructor(private readonly _context: ExtensionContext) {
		ChangesTreeProvider._instances.add(this);
		const interval = setTimeout(() => {
			this.refresh();
		}, PERIODICAL_CHANGE_FETCH_INTERVAL);
		this._disposables.push({
			dispose: () => clearInterval(interval),
		});
	}

	public static refesh(): void {
		this._instances.forEach((i) => i.refresh());
	}

	public refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	public async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
		if (!element) {
			return this._rootViewProvider.getChildren();
		}
		return element.getChildren?.() ?? [];
	}

	public async getTreeItem(element: TreeViewItem): Promise<TreeItem> {
		return await element.getItem();
	}

	public dispose(): void {
		ChangesTreeProvider._instances.delete(this);
		this._disposables.forEach((d) => void d.dispose());
	}
}
