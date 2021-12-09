import {
	GerritCommentSide,
	GerritRevisionFileStatus,
} from '../../../../lib/gerrit/gerritAPI/types';
import {
	Command,
	TextDocumentShowOptions,
	ThemeIcon,
	TreeItem,
	Uri,
	window,
} from 'vscode';
import {
	GerritFile,
	TextContent,
} from '../../../../lib/gerrit/gerritAPI/gerritFile';
import { GerritChange } from '../../../../lib/gerrit/gerritAPI/gerritChange';
import { TreeItemWithoutChildren } from '../../shared/treeTypes';
import { tertiaryWithFallback } from '../../../../lib/util/util';
import { FileMeta } from '../../../../providers/fileProvider';
import * as path from 'path';

export class FileTreeView implements TreeItemWithoutChildren {
	public constructor(
		public filePath: string,
		public change: GerritChange,
		public file: GerritFile,
		public patchsetBase: number | null
	) {}

	private async _getFileBaseContent(
		file: GerritFile
	): Promise<TextContent | null> {
		if (this.patchsetBase === null) {
			return await file.getOldContent();
		}
		const revisions = await this.change.revisions();
		if (!revisions) {
			void window.showErrorMessage('Could not get revisions');
			return null;
		}
		const baseRevision = Object.values(revisions).find(
			(r) => r.number === this.patchsetBase
		);
		if (!baseRevision) {
			void window.showErrorMessage('Could not get revisions');
			return null;
		}
		return await file.getContent(baseRevision.revisionID);
	}

	private async _getFileDiffContent(
		file: GerritFile
	): Promise<[TextContent | null, TextContent | null] | null> {
		if (file.status === GerritRevisionFileStatus.ADDED) {
			return [
				TextContent.from(FileMeta.EMPTY, '', 'utf8'),
				await file.getNewContent(),
			];
		}
		if (file.status === GerritRevisionFileStatus.DELETED) {
			const oldContent = await this._getFileBaseContent(file);
			if (!oldContent) {
				return null;
			}
			return [oldContent, TextContent.from(FileMeta.EMPTY, '', 'utf8')];
		}

		const oldContent = await this._getFileBaseContent(file);
		if (!oldContent) {
			return null;
		}
		const newContent = await file.getNewContent();
		return [oldContent, newContent];
	}

	private async _getFileUri(file: GerritFile): Promise<Uri | null> {
		const contents = await this._getFileDiffContent(file);
		if (!contents) {
			return null;
		}

		const [oldContent, newContent] = contents;

		if (newContent && !newContent.isEmpty()) {
			return newContent.toVirtualFile(
				GerritCommentSide.RIGHT,
				this.patchsetBase
			);
		}
		if (oldContent && !oldContent.isEmpty()) {
			return oldContent.toVirtualFile(
				GerritCommentSide.LEFT,
				this.patchsetBase
			);
		}

		return null;
	}

	private async _createDiffCommand(
		file: GerritFile
	): Promise<Command | null> {
		const contents = await this._getFileDiffContent(file);
		if (!contents) {
			return null;
		}

		const [oldContent, newContent] = contents;
		if (oldContent === null || newContent === null) {
			return null;
		}

		// Never use local file for old content since then you're
		// just editing history which makes no sense.
		const oldURI = oldContent.toVirtualFile(
			GerritCommentSide.LEFT,
			this.patchsetBase
		);
		const newURI = tertiaryWithFallback(
			this.patchsetBase === null && (await file.isLocalFile(newContent)),
			file.getLocalURI(GerritCommentSide.RIGHT, this.patchsetBase),
			newContent.toVirtualFile(GerritCommentSide.RIGHT, this.patchsetBase)
		);

		return {
			command: 'vscode.diff',
			arguments: [
				oldURI,
				newURI,
				path.basename(file.filePath),
				{
					preserveFocus: false,
					preview: true,
				} as TextDocumentShowOptions,
			],
			title: 'Open changed file',
		};
	}

	private _getContextValue(): string {
		const values: string[] = ['filechange'];
		if (
			this.file.status === GerritRevisionFileStatus.RENAMED ||
			!this.file.status
		) {
			values.push('modified');
		}
		return values.join('|');
	}

	public async getItem(): Promise<TreeItem> {
		return {
			label: this.filePath,
			contextValue: this._getContextValue(),
			resourceUri: (await this._getFileUri(this.file)) ?? undefined,
			iconPath: ThemeIcon.File,
			command: (await this._createDiffCommand(this.file)) ?? undefined,
		};
	}
}
