import { PatchSetLevelCommentsTreeView } from './changeTreeView/patchSetLevelCommentsTreeView';
import { ThemeIcon, TreeItem, TreeItemCollapsibleState, window } from 'vscode';
import { GerritRevision } from '../../../lib/gerrit/gerritAPI/gerritRevision';
import { MultiStepEntry, MultiStepper } from '../../../lib/vscode/multiStep';
import { GerritChange } from '../../../lib/gerrit/gerritAPI/gerritChange';
import { TreeItemWithChildren, TreeViewItem } from '../shared/treeTypes';
import { StorageScope, storageSet } from '../../../lib/vscode/storage';
import { GerritFile } from '../../../lib/gerrit/gerritAPI/gerritFile';
import { FolderTreeView } from './changeTreeView/folderTreeView';
import { FileTreeView } from './changeTreeView/fileTreeView';
import { optionalArrayEntry } from '../../../lib/util/util';
import { getReviewWebviewProvider } from '../review';
import { ExtensionContext } from 'vscode';
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

export class ChangeTreeView implements TreeItemWithChildren {
	public patchSetBase: number | null = null;
	public patchSetCurrent: string | null = null;

	public constructor(
		private readonly _context: ExtensionContext,
		public change: GerritChange,
		private readonly _panel: ViewPanel | null
	) {}

	public static getFilesAndFolders(
		change: GerritChange,
		fileMap: FileMap,
		patchsetStart: number | null
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
				(r) => r.revisionID === this.patchSetCurrent
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
		const values = ['gerritchange'];
		if (this.patchSetBase !== null || this.patchSetCurrent !== null) {
			values.push('customPatchset');
		}
		return values.join('.');
	}

	public async openInReview(): Promise<void> {
		// Override
		await storageSet(
			this._context,
			'reviewChangeIDOverride',
			this.change.changeID,
			StorageScope.WORKSPACE
		);

		// Cause rerender
		await getReviewWebviewProvider()?.updateAllStates();

		// Focus panel
		await getReviewWebviewProvider()?.revealAllStates();
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
		if (!this._panel) {
			// Should not be reachable, this command can only be ran on change explorer changes
			return;
		}

		const revisions = await this.change.revisions();
		if (!revisions) {
			void window.showErrorMessage('Failed to find change revisions');
			return;
		}

		const revisionArr = Object.values(revisions);

		const minRevision = Math.min(...revisionArr.map((r) => r.number));
		const maxRevision = Math.max(...revisionArr.map((r) => r.number));
		const stepper = new MultiStepper([
			new MultiStepEntry({
				prompt: 'Select start patchset',
				placeHolder: `Starting patchset: ${minRevision} - ${
					maxRevision - 1
				}`,
				value: String(minRevision),
			}),
			new MultiStepEntry({
				prompt: 'Select end patchset',
				placeHolder: (stepper) =>
					`Starting patchset: ${Math.max(
						stepper.values[0] ? parseInt(stepper.values[0], 10) : 0,
						minRevision
					)} - ${maxRevision}`,
				value: String(maxRevision),
			}),
		]);

		const values = await stepper.run();
		if (!values || !values[0] || !values[1]) {
			return;
		}

		const base = parseInt(values[0], 10);
		const end = parseInt(values[1], 10);
		this.patchSetBase = base === minRevision ? null : base;
		this.patchSetCurrent =
			end === maxRevision
				? null
				: revisionArr.find((r) => r.number === end)?.revisionID ?? null;

		this._panel.refresh();
	}

	public resetPatchsetSelector(): void {
		if (!this._panel) {
			// Should not be reachable, this command can only be ran on change explorer changes
			return;
		}

		this.patchSetBase = this.patchSetCurrent = null;
		this._panel.refresh();
	}
}
