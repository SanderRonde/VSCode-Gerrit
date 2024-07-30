import {
	CancellationToken,
	FileDecoration,
	FileDecorationProvider,
	ThemeColor,
	Uri,
} from 'vscode';
import { FileMetaWithSideAndBase, GERRIT_FILE_SCHEME } from './fileProvider';
import { GerritRevisionFileStatus } from '../lib/gerrit/gerritAPI/types';
import { GerritRepo, getRepoFromUri } from '../lib/gerrit/gerritRepo';
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { GerritFile } from '../lib/gerrit/gerritAPI/gerritFile';
import { Data } from '../lib/util/data';

export class FileModificationStatusProvider implements FileDecorationProvider {
	public constructor(private readonly _gerritReposD: Data<GerritRepo[]>) {}

	private _formatFilePath(filePath: string): string {
		const trimmed = (() => {
			if (filePath.startsWith('/') || filePath.startsWith('\\')) {
				return filePath.substr(1);
			}
			return filePath;
		})();
		return trimmed.replace(/\\/g, '/');
	}

	private _getTooltip(file: GerritFile): string {
		switch (file.status) {
			case GerritRevisionFileStatus.ADDED:
				return 'added';
			case GerritRevisionFileStatus.DELETED:
				return 'deleted';
			case GerritRevisionFileStatus.RENAMED:
				return `renamed ${this._formatFilePath(
					file.oldPath!
				)} -> ${this._formatFilePath(file.filePath)}`;
			default:
				return 'modified';
		}
	}

	private _getColor(status: GerritRevisionFileStatus | null): ThemeColor {
		const color = (() => {
			switch (status) {
				case GerritRevisionFileStatus.ADDED:
					return 'gitDecoration.addedResourceForeground';
				case GerritRevisionFileStatus.DELETED:
					return 'gitDecoration.deletedResourceForeground';
				case GerritRevisionFileStatus.RENAMED:
					return 'gitDecoration.renamedResourceForeground';
				default:
					return 'gitDecoration.modifiedResourceForeground';
			}
		})();
		return new ThemeColor(color);
	}

	private _getLetter(status: GerritRevisionFileStatus | null): string {
		switch (status) {
			case GerritRevisionFileStatus.ADDED:
				return 'A';
			case GerritRevisionFileStatus.DELETED:
				return 'D';
			case GerritRevisionFileStatus.RENAMED:
				return 'R';
			default:
				return 'M';
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

		const gerritRepo = getRepoFromUri(
			this._gerritReposD.get(),
			meta.repoUri.toString()
		);
		if (!gerritRepo) {
			return;
		}

		const change = await GerritChange.getChangeOnce(this._gerritReposD, {
			changeID: meta.changeID,
			gerritRepo: gerritRepo,
		});
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

		return {
			propagate: false,
			badge: this._getLetter(file.status),
			color: this._getColor(file.status),
			tooltip: this._getTooltip(file),
		};
	}
}
