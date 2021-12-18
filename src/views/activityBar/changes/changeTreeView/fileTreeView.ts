import {
	Command,
	commands,
	Disposable,
	TextDocumentShowOptions,
	ThemeIcon,
	TreeItem,
	Uri,
	window,
	workspace,
} from 'vscode';
import {
	OPEN_FILE_IS_CHANGE_DIFF,
	TREE_ITEM_TYPE_FILE,
	TREE_ITEM_WAS_MODIFIED,
} from '../../../../lib/util/magic';
import {
	GerritCommentSide,
	GerritRevisionFileStatus,
} from '../../../../lib/gerrit/gerritAPI/types';
import {
	GerritFile,
	TextContent,
} from '../../../../lib/gerrit/gerritAPI/gerritFile';
import {
	FileMeta,
	GERRIT_FILE_SCHEME,
} from '../../../../providers/fileProvider';
import { GerritChange } from '../../../../lib/gerrit/gerritAPI/gerritChange';
import { DocumentManager } from '../../../../providers/commentProvider';
import { TreeItemWithoutChildren } from '../../shared/treeTypes';
import { tertiaryWithFallback } from '../../../../lib/util/util';
import { CacheContainer } from '../../../../lib/util/cache';
import { PatchsetDescription } from '../changeTreeView';
import * as path from 'path';

export interface DiffEditorMapEntry {
	oldContent: TextContent | null;
	newContent: TextContent | null;
	change: GerritChange;
	file: GerritFile;
	baseRevision: PatchsetDescription | null;
}

export class FileTreeView implements TreeItemWithoutChildren {
	private static _lastKey: number = 0;
	private static _diffEditorMap: CacheContainer<string, DiffEditorMapEntry> =
		new CacheContainer();
	private static _disposables: Disposable[] = [];

	public constructor(
		public filePath: string,
		public change: GerritChange,
		public file: GerritFile,
		public patchsetBase: PatchsetDescription | null
	) {}

	private static _generateNewKey(): string {
		return String(this._lastKey++);
	}

	private static async _getFileBaseContent(
		file: GerritFile,
		patchsetBase: PatchsetDescription | null
	): Promise<TextContent | null> {
		if (patchsetBase === null) {
			return await file.getOldContent();
		}
		return await file.getContent(patchsetBase);
	}

	public static async getFileDiffContent(
		file: GerritFile,
		patchsetBase: PatchsetDescription | null
	): Promise<[TextContent | null, TextContent | null]> {
		if (file.status === GerritRevisionFileStatus.ADDED) {
			return [
				TextContent.from(FileMeta.EMPTY, '', 'utf8'),
				await file.getNewContent(),
			];
		}
		if (file.status === GerritRevisionFileStatus.DELETED) {
			const oldContent = await this._getFileBaseContent(
				file,
				patchsetBase
			);
			return [oldContent, TextContent.from(FileMeta.EMPTY, '', 'utf8')];
		}

		const oldContent = await this._getFileBaseContent(file, patchsetBase);
		const newContent = await file.getNewContent();
		return [oldContent, newContent];
	}

	public static async createDiffCommand(
		file: GerritFile,
		patchsetBase: PatchsetDescription | null
	): Promise<Command | null> {
		const contents = await this.getFileDiffContent(file, patchsetBase);
		if (!contents) {
			return null;
		}

		const [oldContent, newContent] = contents;
		if (oldContent === null || newContent === null) {
			return null;
		}

		// Never use local file for old content since then you're
		// just editing history which makes no sense.
		const key = this._generateNewKey();
		const oldURI = oldContent.toVirtualFile(
			GerritCommentSide.LEFT,
			patchsetBase,
			[OPEN_FILE_IS_CHANGE_DIFF],
			`DIFF-${key}`
		);
		const newURI = tertiaryWithFallback(
			patchsetBase === null && (await file.isLocalFile(newContent)),
			file.getLocalURI(
				GerritCommentSide.RIGHT,
				patchsetBase,
				[OPEN_FILE_IS_CHANGE_DIFF],
				`DIFF-${key}`
			),
			newContent.toVirtualFile(
				GerritCommentSide.RIGHT,
				patchsetBase,
				[OPEN_FILE_IS_CHANGE_DIFF],
				`DIFF-${key}`
			)
		);

		this._diffEditorMap.set(key, {
			newContent,
			oldContent,
			baseRevision: patchsetBase,
			change: file.change,
			file,
		});

		const revisions = await file.change.revisions();
		if (!revisions) {
			return null;
		}

		const isCurrent = revisions[file.currentRevision.id].isCurrentRevision;
		const tabTitle = `${path.basename(file.filePath)} ${
			patchsetBase?.number ?? 'Base'
		} -> ${file.currentRevision.number} ${isCurrent ? '(Latest)' : ''}`;

		return {
			command: 'vscode.diff',
			arguments: [
				oldURI,
				newURI,
				tabTitle,
				{
					preserveFocus: false,
					preview: true,
				} as TextDocumentShowOptions,
			],
			title: 'Open changed file',
		};
	}

	public static init(): typeof FileTreeView {
		this._disposables.push(
			workspace.onDidCloseTextDocument((e) => {
				if (e.uri.scheme !== GERRIT_FILE_SCHEME) {
					return;
				}
				const meta = FileMeta.tryFrom(e.uri);
				if (!meta || !meta.extra || !meta.extra.startsWith('DIFF-')) {
					return;
				}

				const id = meta.extra.slice('DIFF-'.length);
				this._diffEditorMap.delete(id);
			})
		);
		return this;
	}

	public static getDiffEditor(uri: Uri): DiffEditorMapEntry | null {
		if (uri.scheme !== GERRIT_FILE_SCHEME) {
			return null;
		}
		const meta = FileMeta.tryFrom(uri);
		if (!meta || !meta.extra || !meta.extra.startsWith('DIFF-')) {
			return null;
		}

		const id = meta.extra.slice('DIFF-'.length);
		return this._diffEditorMap.get(id) ?? null;
	}

	public static dispose(): void {
		this._disposables.forEach((d) => void d.dispose());
	}

	private _getContextValue(): string {
		const values: string[] = [TREE_ITEM_TYPE_FILE];
		if (
			this.file.status === GerritRevisionFileStatus.RENAMED ||
			!this.file.status
		) {
			values.push(TREE_ITEM_WAS_MODIFIED);
		}
		return values.join('|');
	}

	private async _getFileUri(file: GerritFile): Promise<Uri | null> {
		const contents = await FileTreeView.getFileDiffContent(
			file,
			this.patchsetBase
		);
		if (!contents) {
			return null;
		}

		const [oldContent, newContent] = contents;

		if (newContent && !newContent.isEmpty()) {
			return newContent.toVirtualFile(
				GerritCommentSide.RIGHT,
				this.patchsetBase,
				[OPEN_FILE_IS_CHANGE_DIFF]
			);
		}
		if (oldContent && !oldContent.isEmpty()) {
			return oldContent.toVirtualFile(
				GerritCommentSide.LEFT,
				this.patchsetBase,
				[OPEN_FILE_IS_CHANGE_DIFF]
			);
		}

		return null;
	}

	private async _checkForDiffUpdates(): Promise<void> {
		const openDocs = DocumentManager.getAllDocs();
		for (const doc of openDocs) {
			if (doc.uri.scheme !== GERRIT_FILE_SCHEME) {
				continue;
			}
			const meta = FileMeta.tryFrom(doc.uri);
			if (
				!meta ||
				!meta.extra ||
				!meta.extra.startsWith('DIFF-') ||
				meta.filePath !== this.filePath
			) {
				continue;
			}

			const id = meta.extra.slice('DIFF-'.length);
			const match = FileTreeView._diffEditorMap.get(id);
			if (!match) {
				continue;
			}

			// Found the match, check if file contents have changed
			const files = await FileTreeView.getFileDiffContent(
				this.file,
				this.patchsetBase
			);

			const [oldContent, newContent] = files;
			if (
				!!oldContent !== !!match.oldContent ||
				!!newContent !== !!match.newContent ||
				(oldContent &&
					oldContent.getText() !== match.oldContent!.getText()) ||
				(newContent &&
					newContent.getText() !== match.newContent!.getText())
			) {
				// Prep cmd
				const cmd = await FileTreeView.createDiffCommand(
					this.file,
					this.patchsetBase
				);
				if (!cmd) {
					continue;
				}

				// Found the match, close old one
				await window.showTextDocument(doc.uri, {
					preview: true,
					preserveFocus: false,
				});
				await commands.executeCommand(
					'workbench.action.closeActiveEditor'
				);

				FileTreeView._diffEditorMap.delete(id);

				// Open new one
				await commands.executeCommand(
					cmd.command,
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					...(cmd.arguments ?? [])
				);
			}
		}
	}

	public async getItem(): Promise<TreeItem> {
		// Check if we have any outstanding diff views and update them (if needed)
		void this._checkForDiffUpdates();

		return {
			label: this.filePath,
			contextValue: this._getContextValue(),
			resourceUri: (await this._getFileUri(this.file)) ?? undefined,
			iconPath: ThemeIcon.File,
			command:
				(await FileTreeView.createDiffCommand(
					this.file,
					this.patchsetBase
				)) ?? undefined,
		};
	}
}
