import {
	CancellationToken,
	FileDecoration,
	FileDecorationProvider,
	ThemeColor,
	Uri,
} from 'vscode';
import { FileMetaWithSideAndBase, GERRIT_FILE_SCHEME } from './fileProvider';
import {
	FileChangeKind,
	classifyFile,
} from '../lib/gerrit/gerritAPI/fileChangeKind';
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { GerritFile } from '../lib/gerrit/gerritAPI/gerritFile';

interface DecorationParts {
	letter: string;
	colorKey: string;
	tooltip: string;
}

export class FileModificationStatusProvider implements FileDecorationProvider {
	private _formatFilePath(filePath: string): string {
		const trimmed = (() => {
			if (filePath.startsWith('/') || filePath.startsWith('\\')) {
				return filePath.substr(1);
			}
			return filePath;
		})();
		return trimmed.replace(/\\/g, '/');
	}

	private _decorationParts(
		file: GerritFile,
		kind: FileChangeKind
	): DecorationParts {
		switch (kind.kind) {
			case 'added':
				return {
					letter: 'A',
					colorKey: 'gitDecoration.addedResourceForeground',
					tooltip: 'added',
				};
			case 'deleted':
				return {
					letter: 'D',
					colorKey: 'gitDecoration.deletedResourceForeground',
					tooltip: 'deleted',
				};
			case 'renamed':
				return {
					letter: 'R',
					colorKey: 'gitDecoration.renamedResourceForeground',
					tooltip: `renamed ${this._formatFilePath(
						kind.oldPath
					)} -> ${this._formatFilePath(file.filePath)}`,
				};
			case 'modified':
				return {
					letter: 'M',
					colorKey: 'gitDecoration.modifiedResourceForeground',
					tooltip: 'modified',
				};
		}
	}

	public async provideFileDecoration(
		uri: Uri,
		token: CancellationToken
	): Promise<FileDecoration | undefined> {
		if (uri.scheme !== GERRIT_FILE_SCHEME) {
			return;
		}

		const meta = FileMetaWithSideAndBase.tryFrom(uri);
		if (!meta || meta.isEmpty()) {
			return;
		}

		const change = await GerritChange.getChangeOnce(meta.changeID);
		if (!change || token.isCancellationRequested) {
			return;
		}
		const revision = await change.getCurrentRevision();
		if (!revision || token.isCancellationRequested) {
			return;
		}
		const files = await (
			await revision.files(meta.baseRevision)
		).getValue();
		if (!files || token.isCancellationRequested || !files[meta.filePath]) {
			return;
		}

		const file = files[meta.filePath];
		const parts = this._decorationParts(
			file,
			classifyFile(file)
		);

		return {
			propagate: false,
			badge: parts.letter,
			color: new ThemeColor(parts.colorKey),
			tooltip: parts.tooltip,
		};
	}
}
