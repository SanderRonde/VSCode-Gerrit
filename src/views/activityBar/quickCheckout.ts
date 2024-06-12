import {
	Disposable,
	Event,
	EventEmitter,
	ThemeIcon,
	TreeDataProvider,
	TreeItem,
	TreeItemCollapsibleState,
	TreeView,
	window,
} from 'vscode';
import {
	getQuickCheckoutSubscribable,
	QuickCheckoutApplyInfo,
} from '../../lib/git/quick-checkout';
import { TreeItemWithoutChildren, TreeViewItem } from './shared/treeTypes';
import { GERRIT_QUICK_CHECKOUT_VIEW } from '../../lib/util/constants';
import { Subscribable } from '../../lib/subscriptions/subscriptions';
import { TREE_ITEM_TYPE_QUICK_CHECKOUT } from '../../lib/util/magic';
import { DateTime } from '../../lib/util/dateTime';
import { ViewPanel } from './changes/viewPanel';

export class QuickCheckoutProvider
	implements TreeDataProvider<TreeViewItem>, Disposable
{
	private readonly _disposables: Disposable[] = [];
	private readonly _subscription: Subscribable<QuickCheckoutApplyInfo[]>;

	public onDidChangeTreeDataEmitter: EventEmitter<
		TreeViewItem | undefined | null | void
	> = new EventEmitter<TreeViewItem | undefined | null | void>();
	public readonly onDidChangeTreeData: Event<
		TreeViewItem | undefined | null | void
	> = this.onDidChangeTreeDataEmitter.event;

	public constructor() {
		this._subscription = getQuickCheckoutSubscribable();
		this._disposables.push(this._subscription.disposable);
		this._subscription.subscribe(
			new WeakRef(() => {
				this.refresh();
			})
		);

		ViewPanel.registerWeakInterval(
			new WeakRef(this),
			1000 * 60,
			this._disposables
		);
	}

	public refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	public async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
		if (!element) {
			const items = await this._subscription.getValue();
			return items
				.sort((a, b) => {
					return b.at - a.at;
				})
				.map((item) => new QuickCheckoutTreeEntry(item));
		}
		return element.getChildren?.() ?? [];
	}

	public async getTreeItem(element: TreeViewItem): Promise<TreeItem> {
		return await element.getItem();
	}

	public dispose(): void {
		this._disposables.forEach((d) => void d.dispose());
	}
}

export class QuickCheckoutTreeEntry implements TreeItemWithoutChildren {
	public constructor(public readonly info: QuickCheckoutApplyInfo) {}

	public getItem(): TreeItem | Promise<TreeItem> {
		return {
			label: this.info.originalBranch,
			description: `- ${new DateTime(this.info.at).formatRelative()}`,
			collapsibleState: TreeItemCollapsibleState.None,
			contextValue: TREE_ITEM_TYPE_QUICK_CHECKOUT,
			tooltip: `Stash on branch ${
				this.info.originalBranch
			} @ ${new DateTime(this.info.at).format({
				dateStyle: 'medium',
				timeStyle: 'medium',
			})}`,
			iconPath: new ThemeIcon('database'),
		};
	}
}

let quickCheckoutProvider: TreeView<TreeViewItem> | null = null;
export function getOrCreateQuickCheckoutTreeProvider(): TreeView<TreeViewItem> {
	if (quickCheckoutProvider) {
		return quickCheckoutProvider;
	}
	return (quickCheckoutProvider = window.createTreeView(
		GERRIT_QUICK_CHECKOUT_VIEW,
		{
			treeDataProvider: new QuickCheckoutProvider(),
			showCollapseAll: true,
		}
	));
}

export function getQuickCheckoutTreeProvider(): TreeView<TreeViewItem> | null {
	return quickCheckoutProvider;
}
