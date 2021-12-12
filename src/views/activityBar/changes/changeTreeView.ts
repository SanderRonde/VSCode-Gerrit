import {
	Disposable,
	ExtensionContext,
	ThemeIcon,
	TreeItem,
	TreeItemCollapsibleState,
	window,
} from 'vscode';
import {
	TREE_ITEM_CHANGE_CUSTOM_PATCHSET_SELECTION,
	TREE_ITEM_TYPE_CHANGE,
} from '../../../lib/util/magic';
import { PatchSetLevelCommentsTreeView } from './changeTreeView/patchSetLevelCommentsTreeView';
import { GerritRevision } from '../../../lib/gerrit/gerritAPI/gerritRevision';
import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { TreeItemWithChildren, TreeViewItem } from '../shared/treeTypes';
import { StorageScope, storageSet } from '../../../lib/vscode/storage';
import { GerritFile } from '../../../lib/gerrit/gerritAPI/gerritFile';
import { FolderTreeView } from './changeTreeView/folderTreeView';
import { SearchResultsTreeProvider } from '../searchResults';
import { FileTreeView } from './changeTreeView/fileTreeView';
import { optionalArrayEntry } from '../../../lib/util/util';
import { getReviewWebviewProvider } from '../review';
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

export class ChangeTreeView implements TreeItemWithChildren {
	public patchSetBase: PatchsetDescription | null = null;
	public patchSetCurrent: PatchsetDescription | null = null;

	public constructor(
		private readonly _context: ExtensionContext,
		public change: GerritChange,
		public readonly parent: ViewPanel | SearchResultsTreeProvider
	) {}

	public static async openInReview(changeID: string): Promise<void> {
		// Override
		await storageSet(
			'reviewChangeIDOverride',
			changeID,
			StorageScope.WORKSPACE
		);

		// Cause rerender
		await getReviewWebviewProvider()?.updateAllStates();

		// Focus panel
		await getReviewWebviewProvider()?.revealAllStates();
	}

	public static getFilesAndFolders(
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
					new FolderTreeView(key, change, value.map, patchsetStart)
				);
			}
			fileValues.push(
				...value.files.map(
					(file) => new FileTreeView(key, change, file, patchsetStart)
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

	private async _getEndRevision(): Promise<GerritRevision | null> {
		if (this.patchSetCurrent === null) {
			return await this.change.getCurrentRevision();
		}
		const revisions = await this.change.revisions();
		if (!revisions) {
			return null;
		}

		return (
			Object.values(revisions).find(
				(r) => r.revisionID === this.patchSetCurrent!.id
			) ?? null
		);
	}

	private async _getFiles(): Promise<GerritFile[]> {
		const currentRevision = await this._getEndRevision();
		if (!currentRevision) {
			return [];
		}
		const files = await currentRevision.files(this.patchSetBase);
		if (!files) {
			return [];
		}
		return Object.values(files);
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

	private _buildContextValue(): string {
		const values = [TREE_ITEM_TYPE_CHANGE];
		if (this.patchSetBase !== null || this.patchSetCurrent !== null) {
			values.push(TREE_ITEM_CHANGE_CUSTOM_PATCHSET_SELECTION);
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

	public async openInReview(): Promise<void> {
		await ChangeTreeView.openInReview(this.change.changeID);
	}

	public async getItem(): Promise<TreeItem> {
		const changeNumber = `#${this.change.number}`;

		const owner = await this.change.detailedOwner();

		return {
			label: `${changeNumber}: ${this.change.subject}`,
			collapsibleState: TreeItemCollapsibleState.Collapsed,
			tooltip: this.change.subject,
			contextValue: this._buildContextValue(),
			iconPath: new ThemeIcon('git-pull-request'),
			description: owner ? `by ${owner.getName(true)!}` : undefined,
		};
	}

	public async getChildren(): Promise<TreeViewItem[]> {
		const files = await this._getFiles();
		const collapsed = this._collapseFilePathMap(
			this._getFilePathMap(files)
		);

		return [
			...optionalArrayEntry(
				await PatchSetLevelCommentsTreeView.isVisible(this.change),
				() => new PatchSetLevelCommentsTreeView(this.change)
			),
			...ChangeTreeView.getFilesAndFolders(
				this.change,
				collapsed,
				this.patchSetBase
			),
		];
	}

	public async openPatchsetSelector(): Promise<void> {
		if (!this.parent) {
			// Should not be reachable, this command can only be ran on change explorer changes
			return;
		}

		const revisions = await this.change.revisions();
		if (!revisions) {
			void window.showErrorMessage('Failed to find change revisions');
			return;
		}

		const revisionArr = Object.values(revisions);

		const result = await this._showPatchsetPicker(revisionArr);
		if (result === null) {
			return;
		}

		this.patchSetBase =
			result[0] === null
				? null
				: {
						number: result[0],
						id: revisionArr.find((r) => r.number === result[0])!
							.revisionID,
				  };
		this.patchSetCurrent =
			result[1] === null
				? null
				: {
						number: result[1],
						id: revisionArr.find((r) => r.number === result[1])!
							.revisionID,
				  };

		this.parent.refresh();
	}

	public resetPatchsetSelector(): void {
		if (!this.parent) {
			// Should not be reachable, this command can only be ran on change explorer changes
			return;
		}

		this.patchSetBase = this.patchSetCurrent = null;
		this.parent.refresh();
	}
}
