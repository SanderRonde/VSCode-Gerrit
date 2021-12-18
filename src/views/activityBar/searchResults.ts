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
import { getContextProp, setContextProp } from '../../lib/vscode/context';
import { showInvalidSettingsMessage } from '../../lib/vscode/messages';
import { GerritChange } from '../../lib/gerrit/gerritAPI/gerritChange';
import { FetchMoreTreeItem } from './changes/fetchMoreTreeItem';
import { GerritAPIWith } from '../../lib/gerrit/gerritAPI/api';
import { optionalArrayEntry } from '../../lib/util/util';
import { getAPI } from '../../lib/gerrit/gerritAPI';
import { Refreshable } from './shared/refreshable';
import { TreeViewItem } from './shared/treeTypes';
import { Focusable } from './shared/focusable';
import { Clearable } from './shared/clearable';
import { log } from '../../lib/util/log';

export class SearchResultsTreeProvider
	extends CanFetchMoreTreeProvider
	implements TreeDataProvider<TreeViewItem>, Disposable, Focusable, Clearable
{
	private static _instances: Set<Refreshable & Focusable & Clearable> =
		new Set();
	private _disposables: Disposable[] = [];
	private _lastQuery: string | null = null;
	private _lastFocused: string | null = null;

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
		const singleChangeQuery = getContextProp('gerrit:searchChangeNumber');
		if (singleChangeQuery) {
			const api = await getAPI();
			if (!api) {
				await showInvalidSettingsMessage(
					'Failed to perform search due to invalid API settings, please check your settings'
				);
				return [];
			}

			this._reset();
			this._lastQuery = null;

			const change = await GerritChange.getChangeCached(
				String(singleChangeQuery)
			);
			if (!change) {
				await setContextProp('gerrit:searchChangeNumber', null);
				await showInvalidSettingsMessage('Failed to find change');
				return [];
			}

			return [change];
		}

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
			(code, body): void => {
				const queryFailMsg = `Failed to perform search with query "${query}"`;
				log(
					queryFailMsg,
					`Status code = ${code ?? '?'}`,
					`response body = "${body}"`
				);
				void window.showErrorMessage(queryFailMsg);
			},
			GerritAPIWith.DETAILED_ACCOUNTS
		);
		return res;
	}

	public clear(): void {
		this._reset();
		this._lastFocused = null;
	}

	public refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	// We need to implement this but it'll always return the root
	// so no need to implement anything
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

		const changes = await this._fetch(this);
		const hasMore =
			changes.length > 0 &&
			changes[changes.length - 1].change.moreChanges;

		if (getContextProp('gerrit:searchChangeNumber')) {
			// Only focus once per search result
			if (this._lastFocused !== changes[0].change.changeID) {
				setTimeout(() => {
					void this.treeView.reveal(changes[0], {
						expand: true,
						focus: true,
						select: true,
					});
				}, 50);
				this._lastFocused = changes[0].change.changeID;
			}
		} else {
			this._lastFocused = null;
		}

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
