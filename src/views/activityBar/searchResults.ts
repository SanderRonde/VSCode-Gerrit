import {
	Disposable,
	Event,
	EventEmitter,
	TreeDataProvider,
	TreeItem,
	TreeView,
	window,
} from 'vscode';
import { CanFetchMoreTreeProvider } from './shared/canFetchMoreTreeProvider';
import { showInvalidSettingsMessage } from '../../lib/vscode/messages';
import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { FetchMoreTreeItem } from './changes/fetchMoreTreeItem';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { getContextProp } from '../../lib/vscode/context';
import { optionalArrayEntry } from '../../lib/util/util';
import { getAPI } from '../../lib/gerrit/gerritAPI';
import { Refreshable } from './shared/refreshable';
import { Focusable } from './shared/focusable';
import { Clearable } from './shared/clearable';
import { TreeViewItem } from './treeTypes';
import { log } from '../../lib/util/log';

export class SearchResultsTreeProvider
	extends CanFetchMoreTreeProvider
	implements TreeDataProvider<TreeViewItem>, Disposable, Focusable, Clearable
{
	private static _instances: Set<Refreshable & Focusable & Clearable> =
		new Set();
	private _disposables: Disposable[] = [];
	private _lastQuery: string | null = null;

	protected _initialLimit: number = 100;
	protected _fetchMoreCount: number = 100;

	public onDidChangeTreeDataEmitter: EventEmitter<
		TreeViewItem | undefined | null | void
	> = new EventEmitter<TreeViewItem | undefined | null | void>();
	public readonly onDidChangeTreeData: Event<
		TreeViewItem | undefined | null | void
	> = this.onDidChangeTreeDataEmitter.event;

	public treeView!: TreeView<TreeViewItem>;

	public constructor() {
		super();
		SearchResultsTreeProvider._instances.add(this);
	}

	public static clear(): void {
		this._instances.forEach((i) => i.clear());
	}

	public static refesh(): void {
		this._instances.forEach((i) => i.refresh());
	}

	public static focus(): void {
		this._instances.forEach((i) => void i.focus());
	}

	protected async _getChanges(
		offset: number,
		count: number
	): Promise<GerritChange[]> {
		const query = getContextProp('gerrit:searchQuery');
		if (query !== this._lastQuery) {
			this._reset();
			this._lastQuery = query;
		}

		if (!query) {
			// This shouldn't even be possible, fail silently because this
			// panel should be hidden
			return [];
		}

		const api = await getAPI();
		if (!api) {
			await showInvalidSettingsMessage(
				'Failed to perform search due to invalid API settings, please check your settings'
			);
			return [];
		}

		const res = await api.searchChanges(
			query,
			{
				offset,
				count,
			},
			async (code, body): Promise<void> => {
				const queryFailMsg = `Failed to perform search with query "${query}"`;
				log(
					queryFailMsg,
					`Status code = ${code}`,
					`response body = "${body}"`
				);
				await window.showErrorMessage(queryFailMsg);
			},
			GerritAPIWith.DETAILED_ACCOUNTS
		);
		return res;
	}

	public clear(): void {
		this._reset();
	}

	public refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	// We need to implement this but it'll never be called so it doesn't
	// have to do anything...
	public getParent(): undefined {
		return undefined;
	}

	public async focus(): Promise<void> {
		// @ts-expect-error Secret API but you can just pass undefined to this and it works...
		await this.treeView.reveal(undefined, {
			select: false,
			focus: true,
		});
	}

	public async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
		if (element) {
			if (!element.getChildren) {
				return [];
			}
			return element.getChildren();
		}

		const changes = await this._fetch();
		const hasMore =
			changes.length > 0 &&
			changes[changes.length - 1].change.moreChanges;
		return [
			...changes,
			...optionalArrayEntry(hasMore, () => new FetchMoreTreeItem(this)),
		];
	}

	public async getTreeItem(element: TreeViewItem): Promise<TreeItem> {
		return await element.getItem();
	}

	public dispose(): void {
		SearchResultsTreeProvider._instances.delete(this);
		this._disposables.forEach((d) => void d.dispose());
	}
}
