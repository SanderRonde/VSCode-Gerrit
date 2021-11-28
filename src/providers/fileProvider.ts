import {
	CancellationToken,
	ExtensionContext,
	TextDocumentContentProvider,
	Uri,
	workspace,
} from 'vscode';
import { FileCache } from '../views/activityBar/changes/changeTreeView/file/fileCache';
import { GerritCommentSide } from '../lib/gerritAPI/types';
import { getAPI } from '../lib/gerritAPI';

export interface FileMeta {
	project: string;
	changeId: string;
	commit: string;
	filePath: string;
	side: GerritCommentSide;
}

export const GERRIT_FILE_SCHEME = 'gerrit-file';

export const EMPTY_FILE_META: Omit<FileMeta, 'side'> = {
	project: '',
	commit: '',
	filePath: '',
	changeId: '',
};

export class FileProvider implements TextDocumentContentProvider {
	public constructor(public context: ExtensionContext) {
		context.subscriptions.push(
			workspace.onDidCloseTextDocument((doc) => {
				if (doc.uri.scheme === GERRIT_FILE_SCHEME) {
					const data = FileProvider.getFileMeta(doc.uri);
					FileCache.delete(data.project, data.commit, data.filePath);
				}
			})
		);
	}

	public static tryGetFileMeta(uri: Uri): FileMeta | null {
		try {
			return this.getFileMeta(uri);
		} catch (e) {
			return null;
		}
	}

	public static getFileMeta(uri: Uri): FileMeta {
		return JSON.parse(uri.query) as FileMeta;
	}

	// We put this in a function just so that when the signature
	// of FileMeta changes, TS notices
	public static createMeta(meta: FileMeta): string {
		return JSON.stringify(meta);
	}

	public static fileMetaToKey(meta: FileMeta): string {
		return `${meta.project}/${meta.changeId}/${meta.commit}/${meta.filePath}/${meta.side}`;
	}

	private _isEmptyFile(fileMeta: FileMeta): boolean {
		return (
			fileMeta.project === '' &&
			fileMeta.commit === '' &&
			fileMeta.filePath === '' &&
			fileMeta.changeId === ''
		);
	}

	public async provideTextDocumentContent(
		uri: Uri,
		token: CancellationToken
	): Promise<string | null> {
		const data = FileProvider.getFileMeta(uri);
		if (this._isEmptyFile(data)) {
			return '';
		}

		const api = await getAPI();
		if (!api) {
			return null;
		}

		const content = await api.getFileContent(
			data.project,
			data.commit,
			data.changeId,
			data.filePath
		);

		if (!content || token.isCancellationRequested) {
			return null;
		}

		return content.getText();
	}
}
