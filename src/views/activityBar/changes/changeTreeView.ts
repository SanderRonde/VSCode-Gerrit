import {
	TREE_ITEM_CHANGE_CUSTOM_PATCHSET_SELECTION,
	TREE_ITEM_IS_CURRENT,
	TREE_ITEM_IS_NOT_CURRENT,
	TREE_ITEM_TYPE_CHANGE,
} from '../../../lib/util/magic';
import {
	APISubscriptionManager,
	Subscribable,
} from '../../../lib/subscriptions/subscriptions';
import {
	Disposable,
	ThemeIcon,
	TreeItem,
	TreeItemCollapsibleState,
	window,
} from 'vscode';
import { PatchSetLevelCommentsTreeView } from './changeTreeView/patchSetLevelCommentsTreeView';
import { GerritRevision } from '../../../lib/gerrit/gerritAPI/gerritRevision';
import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { TreeItemWithChildren, TreeViewItem } from '../shared/treeTypes';
import { StorageScope, storageSet } from '../../../lib/vscode/storage';
import { GerritFile } from '../../../lib/gerrit/gerritAPI/gerritFile';
import { getAPIForSubscription } from '../../../lib/gerrit/gerritAPI';
import { getCurrentChangeIDCached } from '../../../lib/git/commit';
import { GerritAPIWith } from '../../../lib/gerrit/gerritAPI/api';
import { SelfDisposable } from '../../../lib/util/selfDisposable';
import { FolderTreeView } from './changeTreeView/folderTreeView';
import { FileTreeView } from './changeTreeView/fileTreeView';
import { SearchResultsTreeProvider } from '../searchResults';
import { GerritRepo } from '../../../lib/gerrit/gerritRepo';
import { optionalArrayEntry } from '../../../lib/util/util';
import { ReviewWebviewProvider } from '../review';
import { Data } from '../../../lib/util/data';
import { ViewPanel } from './viewPanel';

export type FileMap = Map<
	string,
	{
		files: GerritFile[];
		map: FileMap;
	}
>;

interface FileWithPath {
	file: GerritFile;
	path: string[];
}

export interface PatchsetDescription {
	number: number;
	id: string;
}

export class ChangeTreeView
	extends SelfDisposable
	implements TreeItemWithChildren
{
	public get change(): Promise<GerritChange | null> {
		return this._subscription.getValue();
	}

	private constructor(
		public readonly gerritReposD: Data<GerritRepo[]>,
		public readonly gerritRepo: GerritRepo,
		public readonly changeID: string,
		public readonly parent: ViewPanel | SearchResultsTreeProvider,
		private readonly _subscription: Subscribable<GerritChange | null>,
		private readonly _patchSetBase: PatchsetDescription | null = null,
		private readonly _patchSetCurrent: PatchsetDescription | null = null
	) {
		super(`changeTreeView.${changeID}`);
	}

	public static async create(
		gerritReposD: Data<GerritRepo[]>,
		gerritRepo: GerritRepo,
		changeID: string,
		parent: ViewPanel | SearchResultsTreeProvider
	): Promise<ChangeTreeView> {
		const api = await getAPIForSubscription(gerritReposD, gerritRepo);
		const subscription = api.getChange(changeID, null, [
			GerritAPIWith.DETAILED_ACCOUNTS,
		]);

		let patchsetBase = null;
		let patchsetCurrent = null;
		if (parent instanceof ViewPanel) {
			const patchsets = parent.patchsetsForChange.get(changeID);
			if (patchsets) {
				patchsetBase = patchsets.patchSetBase;
				patchsetCurrent = patchsets.patchSetCurrent;
			}
		}
		const instance = new this(
			gerritReposD,
			gerritRepo,
			changeID,
			parent,
			subscription,
			patchsetBase,
			patchsetCurrent
		);
		instance._disposables.push(subscription.disposable);
		subscription.subscribe(new WeakRef(() => parent.reload()));
		return instance;
	}

	public static async openInReview(
		gerritRepo: GerritRepo,
		reviewWebviewProvider: ReviewWebviewProvider,
		changeID: string
	): Promise<void> {
		// Override
		await storageSet(
			'reviewChangeIDOverride',
			{
				changeID,
				repoURI: gerritRepo.rootUri.toString(),
			},
			StorageScope.WORKSPACE
		);

		// Cause rerender
		await reviewWebviewProvider.updateAllStates();

		// Focus panel
		await reviewWebviewProvider.revealAllStates();
	}

	public static getFilesAndFolders(
		gerritRepos: Data<GerritRepo[]>,
		gerritRepo: GerritRepo,
		change: GerritChange,
		fileMap: FileMap,
		patchsetStart: PatchsetDescription | null
	): TreeViewItem[] {
		const currentValues = [...fileMap.entries()];
		const folderValues = [];
		const fileValues = [];

		for (const [key, value] of currentValues) {
			if (value.map.size) {
				folderValues.push(
					new FolderTreeView(
						gerritRepos,
						gerritRepo,
						key,
						change,
						value.map,
						patchsetStart
					)
				);
			}
			fileValues.push(
				...value.files.map(
					(file) =>
						new FileTreeView(
							gerritRepos,
							gerritRepo,
							key,
							change,
							file,
							patchsetStart
						)
				)
			);
		}

		return [
			...folderValues.sort((a, b) =>
				a.folderPath.localeCompare(b.folderPath)
			),
			...fileValues.sort((a, b) => a.filePath.localeCompare(b.filePath)),
		];
	}

	private _getFilePaths(files: GerritFile[]): FileWithPath[] {
		return files.map((file) => ({
			path: file.filePath.split('/'),
			file,
		}));
	}

	private _createFilePathMap(
		file: FileWithPath,
		map: FileMap = new Map()
	): FileMap {
		if (!map.has(file.path[0])) {
			map.set(file.path[0], {
				files: [],
				map: new Map(),
			});
		}
		if (file.path.length === 1) {
			map.get(file.path[0])!.files.push(file.file);
		} else {
			const currentMap = map.get(file.path[0])!.map;
			this._createFilePathMap(
				{
					file: file.file,
					path: file.path.slice(1),
				},
				currentMap
			);
		}
		return map;
	}

	private async _getEndRevision(
		change: GerritChange
	): Promise<GerritRevision | null> {
		if (this._patchSetCurrent === null) {
			return await change.getCurrentRevision();
		}
		const revisions = await change.revisions();
		if (!revisions) {
			return null;
		}

		return (
			Object.values(revisions).find(
				(r) => r.revisionID === this._patchSetCurrent!.id
			) ?? null
		);
	}

	private async _getFiles(
		change: GerritChange
	): Promise<Subscribable<GerritFile[]>> {
		const currentRevision = await this._getEndRevision(change);
		if (!currentRevision) {
			return APISubscriptionManager.getNullSubscription().mapSubscription(
				() => []
			);
		}
		return (
			await currentRevision.files(this._patchSetBase)
		).mapSubscription((i) => Object.values(i));
	}

	private _collapseFilePathMap(
		filePathMap: FileMap,
		currentPath: string[] = [],
		collapsed: FileMap = new Map()
	): FileMap {
		const entries = [...filePathMap.entries()];
		if (entries.length === 0) {
			return collapsed;
		}
		if (
			entries.length === 1 &&
			entries[0][1].map &&
			entries[0][1].files.length === 0
		) {
			return this._collapseFilePathMap(
				entries[0][1].map,
				[...currentPath, entries[0][0]],
				collapsed
			);
		}

		// Collapse
		const newMap = new Map();
		if (currentPath.length !== 0) {
			collapsed.set(currentPath.join('/'), {
				files: [],
				map: newMap,
			});
		}
		const currentMap: FileMap =
			currentPath.length === 0 ? collapsed : newMap;

		for (const [key, value] of entries) {
			currentMap.set(key, {
				files: value.files,
				map: new Map(),
			});

			this._collapseFilePathMap(value.map, [key], currentMap);
		}

		return collapsed;
	}

	private _getFilePathMap(files: GerritFile[]): FileMap {
		const filesWithPaths = this._getFilePaths(files);
		const pathMap: FileMap = new Map();
		for (const file of filesWithPaths) {
			this._createFilePathMap(file, pathMap);
		}
		return pathMap;
	}

	private async _buildContextValue(): Promise<string> {
		const values = [TREE_ITEM_TYPE_CHANGE];
		if (this._patchSetBase !== null || this._patchSetCurrent !== null) {
			values.push(TREE_ITEM_CHANGE_CUSTOM_PATCHSET_SELECTION);
		}
		const currentChangeID = await getCurrentChangeIDCached();
		if (
			currentChangeID &&
			currentChangeID.changeID === this.changeID &&
			currentChangeID.gerritRepo.rootUri.toString() ===
				this.gerritRepo.rootUri.toString()
		) {
			values.push(TREE_ITEM_IS_CURRENT);
		} else {
			values.push(TREE_ITEM_IS_NOT_CURRENT);
		}
		return values.join('.');
	}

	private _showPatchsetPicker(
		revisions: GerritRevision[]
	): Promise<[number | null, number | null] | null> {
		return new Promise<[number | null, number | null] | null>((resolve) => {
			const maxRevision = Math.max(...revisions.map((r) => r.number));

			const quickPick = window.createQuickPick();
			quickPick.step = 1;
			quickPick.totalSteps = 2;
			quickPick.items = [
				{
					label: 'Base',
					description: 'Base revision (parent branch/change)',
				},
				...revisions
					.sort((a, b) => a.number - b.number)
					.map((r) => ({
						label: String(r.number),
						description: 'Revision ' + String(r.number),
					})),
			];
			quickPick.selectedItems = [quickPick.items[0]];
			quickPick.title = 'Select start patchset';
			quickPick.show();

			const disposables: Disposable[] = [];
			const values: (number | null)[] = [];
			disposables.push(
				quickPick.onDidAccept(() => {
					if (quickPick.step === 1) {
						values.push(
							quickPick.selectedItems[0].label === 'Base'
								? null
								: parseInt(quickPick.selectedItems[0].label, 10)
						);
						quickPick.step = 2;
						quickPick.title = 'Select end patchset';
						quickPick.items = revisions
							.sort((a, b) => a.number - b.number)
							.filter(
								(r) =>
									values[0] === null || r.number > values[0]
							)
							.map((r) => ({
								label: String(r.number),
								description: 'Revision ' + String(r.number),
							}));
					} else {
						const selectedNum = parseInt(
							quickPick.selectedItems[0].label,
							10
						);
						values.push(
							selectedNum === maxRevision ? null : selectedNum
						);
						resolve(
							values as unknown as [number | null, number | null]
						);
						quickPick.hide();
					}
				})
			);
			disposables.push(
				quickPick.onDidHide(() => {
					disposables.forEach((d) => void d.dispose());
					resolve(null);
				})
			);
		});
	}

	public async openInReview(
		reviewWebviewProvider: ReviewWebviewProvider
	): Promise<void> {
		await ChangeTreeView.openInReview(
			this.gerritRepo,
			reviewWebviewProvider,
			this.changeID
		);
	}

	public async getItem(): Promise<TreeItem> {
		const change = await this.change;
		if (!change) {
			return {
				label: '?',
			};
		}

		const { label, description } = await change.getFormattedNames();
		return {
			label: label,
			collapsibleState: TreeItemCollapsibleState.Collapsed,
			tooltip: change.subject,
			contextValue: await this._buildContextValue(),
			iconPath: new ThemeIcon('git-pull-request'),
			description: description,
		};
	}

	public async getChildren(): Promise<TreeViewItem[]> {
		const change = await this.change;
		if (!change) {
			return [];
		}

		const filesSubscription = await this._getFiles(change);
		const files = await filesSubscription.getValue();
		filesSubscription.subscribeOnce(
			new WeakRef(() => {
				this.parent.reload();
			})
		);

		const collapsed = this._collapseFilePathMap(
			this._getFilePathMap(files)
		);

		return [
			...optionalArrayEntry(
				await PatchSetLevelCommentsTreeView.isVisible(
					this.gerritReposD,
					change
				),
				() =>
					new PatchSetLevelCommentsTreeView(
						change.changeID,
						this.gerritReposD,
						change.gerritRepo,
						change.number,
						this.parent
					)
			),
			...ChangeTreeView.getFilesAndFolders(
				this.gerritReposD,
				this.gerritRepo,
				change,
				collapsed,
				this._patchSetBase
			),
		];
	}

	public async openPatchsetSelector(): Promise<void> {
		if (
			!this.parent ||
			!(await this.change) ||
			!(this.parent instanceof ViewPanel)
		) {
			// Should not be reachable, this command can only be ran on change explorer changes
			return;
		}

		const change = (await this.change)!;
		const revisions = await change.revisions();
		if (!revisions) {
			void window.showErrorMessage('Failed to find change revisions');
			return;
		}

		const revisionArr = Object.values(revisions);

		const result = await this._showPatchsetPicker(revisionArr);
		if (result === null) {
			return;
		}

		this.parent.patchsetsForChange.set(this.changeID, {
			patchSetBase:
				result[0] === null
					? null
					: {
							number: result[0],
							id: revisionArr.find((r) => r.number === result[0])!
								.revisionID,
						},
			patchSetCurrent:
				result[1] === null
					? null
					: {
							number: result[1],
							id: revisionArr.find((r) => r.number === result[1])!
								.revisionID,
						},
		});

		await this.parent.refresh();
	}

	public async resetPatchsetSelector(): Promise<void> {
		if (!this.parent || !(this.parent instanceof ViewPanel)) {
			// Should not be reachable, this command can only be ran on change explorer changes
			return;
		}

		this.parent.patchsetsForChange.delete(this.changeID);
		await this.parent.refresh();
	}
}
