import {
	Disposable,
	Event,
	EventEmitter,
	TreeDataProvider,
	TreeItem,
	TreeItemCollapsibleState,
	TreeView,
	window,
} from 'vscode';
import {
	GERRIT_CHANGE_EXPLORER_VIEW,
	PERIODICAL_CHANGE_FETCH_INTERVAL,
} from '../../lib/util/constants';
import {
	GerritRemoteWithConfig,
	GerritRepo,
} from '../../lib/gerrit/gerritRepo';
import { getRemotesWithConfig } from '../../lib/credentials/credentials';
import { TreeItemWithChildren, TreeViewItem } from './shared/treeTypes';
import { FileTreeView } from './changes/changeTreeView/fileTreeView';
import { RootTreeViewProvider } from './changes/rootTreeView';
import { ChangeTreeView } from './changes/changeTreeView';
import { onChangeLastCommit } from '../../lib/git/git';
import { ViewPanel } from './changes/viewPanel';
import { Data } from '../../lib/util/data';

export class ChangesTreeProvider
	implements TreeDataProvider<TreeViewItem>, Disposable
{
	private static _instances: Set<ChangesTreeProvider> = new Set();
	private _disposables: Disposable[] = [];
	private _rootViewProvider:
		| RootTreeViewProvider
		| MultiRepoTreeViewProvider
		| null = null;
	public get rootViewProvider(): Promise<
		RootTreeViewProvider | MultiRepoTreeViewProvider
	> {
		return (async () => {
			const gerritRepos = this._gerritReposD.get();
			const remotesWithConfigs = Object.values(
				await getRemotesWithConfig(gerritRepos)
			);

			if (remotesWithConfigs.length === 1) {
				if (!(this._rootViewProvider instanceof RootTreeViewProvider)) {
					this._rootViewProvider = new RootTreeViewProvider(
						this._gerritReposD,
						remotesWithConfigs[0],
						this
					);
				}
				return this._rootViewProvider;
			}

			if (
				!(this._rootViewProvider instanceof MultiRepoTreeViewProvider)
			) {
				this._rootViewProvider = new MultiRepoTreeViewProvider(
					this._gerritReposD,
					remotesWithConfigs,
					this
				);
			}
			return this._rootViewProvider;
		})();
	}

	public onDidChangeTreeDataEmitter: EventEmitter<
		TreeViewItem | undefined | null | void
	> = new EventEmitter<TreeViewItem | undefined | null | void>();
	public readonly onDidChangeTreeData: Event<
		TreeViewItem | undefined | null | void
	> = this.onDidChangeTreeDataEmitter.event;

	public constructor(private readonly _gerritReposD: Data<GerritRepo[]>) {
		ChangesTreeProvider._instances.add(this);
		this._disposables.push(
			_gerritReposD.subscribe(() => this.refresh(), false)
		);
		this._disposables.push(FileTreeView.init());
		const interval = setTimeout(() => {
			this.refresh();
		}, PERIODICAL_CHANGE_FETCH_INTERVAL);
		this._disposables.push({
			dispose: () => clearInterval(interval),
		});

		this._disposables.push(
			onChangeLastCommit(_gerritReposD, () => {
				this.refresh();
			})
		);
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
			return (await this.rootViewProvider).getChildren();
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

class MultiRepoTreeViewProvider implements TreeItemWithChildren {
	private _lastChildren: RootTreeViewProvider[] = [];

	public constructor(
		private readonly _gerritReposD: Data<GerritRepo[]>,
		private readonly _gerritRemotes: GerritRemoteWithConfig[],
		public readonly root: ChangesTreeProvider
	) {}

	public getItem(): Promise<TreeItem> {
		return Promise.resolve({});
	}

	public getLastChildren(): RootTreeViewProvider[] {
		return this._lastChildren;
	}

	public getChildren(): RootTreeViewProvider[] {
		const children: RootTreeViewProvider[] = [];
		for (const remote of this._gerritRemotes) {
			children.push(
				new RootTreeViewProvider(
					this._gerritReposD,
					remote,
					this.root,
					{
						label: remote.url,
						collapsibleState: TreeItemCollapsibleState.Expanded,
					}
				)
			);
		}
		return (this._lastChildren = children);
	}
}

let changesTreeProvider: TreeView<TreeViewItem> | null = null;
export function getOrCreateChangesTreeProvider(
	gerritRepos: Data<GerritRepo[]>
): TreeView<TreeViewItem> {
	if (changesTreeProvider) {
		return changesTreeProvider;
	}
	return (changesTreeProvider = window.createTreeView(
		GERRIT_CHANGE_EXPLORER_VIEW,
		{
			treeDataProvider: new ChangesTreeProvider(gerritRepos),
			showCollapseAll: true,
		}
	));
}

export function getChangesTreeProvider(): TreeView<TreeViewItem> | null {
	return changesTreeProvider;
}
