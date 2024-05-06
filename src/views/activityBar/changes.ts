import {
	Disposable,
	Event,
	EventEmitter,
	TreeDataProvider,
	TreeItem,
	TreeView,
	window,
} from 'vscode';
import {
	GERRIT_CHANGE_EXPLORER_VIEW,
	PERIODICAL_CHANGE_FETCH_INTERVAL,
} from '../../lib/util/constants';
import { FileTreeView } from './changes/changeTreeView/fileTreeView';
import { RootTreeViewProvider } from './changes/rootTreeView';
import { Repository } from '../../types/vscode-extension-git';
import { ChangeTreeView } from './changes/changeTreeView';
import { onChangeLastCommit } from '../../lib/git/git';
import { TreeViewItem } from './shared/treeTypes';
import { ViewPanel } from './changes/viewPanel';

export class ChangesTreeProvider
	implements TreeDataProvider<TreeViewItem>, Disposable
{
	private static _instances: Set<ChangesTreeProvider> = new Set();
	private _disposables: Disposable[] = [];
	public rootViewProvider = new RootTreeViewProvider(this._gerritRepo, this);

	public onDidChangeTreeDataEmitter: EventEmitter<
		TreeViewItem | undefined | null | void
	> = new EventEmitter<TreeViewItem | undefined | null | void>();
	public readonly onDidChangeTreeData: Event<
		TreeViewItem | undefined | null | void
	> = this.onDidChangeTreeDataEmitter.event;

	public constructor(private readonly _gerritRepo: Repository) {
		ChangesTreeProvider._instances.add(this);
		this._disposables.push(FileTreeView.init());
		const interval = setTimeout(() => {
			this.refresh();
		}, PERIODICAL_CHANGE_FETCH_INTERVAL);
		this._disposables.push({
			dispose: () => clearInterval(interval),
		});
		void (async () => {
			this._disposables.push(
				await onChangeLastCommit(
					_gerritRepo,
					() => {
						this.refresh();
					},
					false
				)
			);
		})();
	}

	public static refesh(): void {
		this.getInstances().forEach((i) => i.refresh());
	}

	public static getInstances(): ChangesTreeProvider[] {
		return [...this._instances.values()];
	}

	public getParent(element: TreeViewItem): TreeViewItem | undefined {
		if (
			element instanceof ChangeTreeView &&
			element.parent instanceof ViewPanel
		) {
			return element.parent ?? undefined;
		}
		if (element instanceof ViewPanel) {
			return element.parent;
		}
		if (element instanceof RootTreeViewProvider) {
			return undefined;
		}
		return undefined;
	}

	public refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	public async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
		if (!element) {
			return this.rootViewProvider.getChildren();
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

let changesTreeProvider: TreeView<TreeViewItem> | null = null;
export function getOrCreateChangesTreeProvider(
	gerritRepo: Repository
): TreeView<TreeViewItem> {
	if (changesTreeProvider) {
		return changesTreeProvider;
	}
	return (changesTreeProvider = window.createTreeView(
		GERRIT_CHANGE_EXPLORER_VIEW,
		{
			treeDataProvider: new ChangesTreeProvider(gerritRepo),
			showCollapseAll: true,
		}
	));
}

export function getChangesTreeProvider(): TreeView<TreeViewItem> | null {
	return changesTreeProvider;
}
