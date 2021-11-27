import {
	GerritCommentSide,
	GerritRevisionFileStatus,
} from '../../../../lib/gerritAPI/types';
import {
	Command,
	TextDocumentShowOptions,
	ThemeIcon,
	TreeItem,
	Uri,
} from 'vscode';
import { GerritFile, TextContent } from '../../../../lib/gerritAPI/gerritFile';
import { GerritChange } from '../../../../lib/gerritAPI/gerritChange';
import { EMPTY_FILE_META } from '../../../../providers/fileProvider';
import { tertiaryWithFallback } from '../../../../lib/util';
import { TreeItemWithoutChildren } from '../../treeTypes';
import * as path from 'path';

async function getFileDiffContent(
	file: GerritFile
): Promise<[TextContent | null, TextContent | null]> {
	if (file.status === GerritRevisionFileStatus.ADDED) {
		return [
			TextContent.from(EMPTY_FILE_META, '', 'utf8'),
			await file.getNewContent(),
		];
	}
	if (file.status === GerritRevisionFileStatus.DELETED) {
		return [
			await file.getOldContent(),
			TextContent.from(EMPTY_FILE_META, '', 'utf8'),
		];
	}
	const [oldContent, newContent] = await Promise.all([
		file.getOldContent(),
		file.getNewContent(),
	]);
	return [oldContent, newContent];
}

async function getFileUri(file: GerritFile): Promise<Uri | null> {
	const [oldContent, newContent] = await getFileDiffContent(file);

	if (newContent && !newContent.isEmpty()) {
		return newContent.toVirtualFile(GerritCommentSide.RIGHT);
	}
	if (oldContent && !oldContent.isEmpty()) {
		return oldContent.toVirtualFile(GerritCommentSide.LEFT);
	}

	return null;
}

async function createDiffCommand(file: GerritFile): Promise<Command | null> {
	const [oldContent, newContent] = await getFileDiffContent(file);
	if (oldContent === null || newContent === null) {
		return null;
	}

	// Never use local file for old content since then you're
	// just editing history which makes no sense.
	const oldURI = oldContent.toVirtualFile(GerritCommentSide.LEFT);
	// TODO: Only use local file when checking out this patch
	const newURI = tertiaryWithFallback(
		await file.isLocalFile(newContent),
		file.getLocalURI(GerritCommentSide.RIGHT),
		newContent.toVirtualFile(GerritCommentSide.RIGHT)
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

export class FileTreeView implements TreeItemWithoutChildren {
	public constructor(
		public filePath: string,
		public change: GerritChange,
		public file: GerritFile
	) {}

	public async getItem(): Promise<TreeItem> {
		// TODO: strikethrough deleted stuff etc
		return {
			label: this.filePath,
			contextValue: 'view-online',
			resourceUri: (await getFileUri(this.file)) ?? undefined,
			iconPath: ThemeIcon.File,
			command: (await createDiffCommand(this.file)) ?? undefined,
		};
	}
}
