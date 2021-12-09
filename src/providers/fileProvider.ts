import {
	CancellationToken,
	ExtensionContext,
	TextDocumentContentProvider,
	Uri,
	workspace,
} from 'vscode';
import { FileCache } from '../views/activityBar/changes/changeTreeView/file/fileCache';
import { GerritCommentSide } from '../lib/gerrit/gerritAPI/types';
import { getAPI } from '../lib/gerrit/gerritAPI';

export const GERRIT_FILE_SCHEME = 'gerrit-file';

interface FileMetaCreate {
	project: string;
	changeID: string;
	commit: string;
	filePath: string;
	isVirtual?: boolean;
	content?: string;
}

export class FileMeta {
	public static PATCHSET_LEVEL = new FileMeta('', '', '', '');
	public static EMPTY = new FileMeta('', '', '', '');

	protected constructor(
		public project: string,
		public changeID: string,
		public commit: string,
		public filePath: string,
		public isVirtual: boolean = false,
		public content: string = ''
	) {}

	public static from(uri: Uri): FileMeta {
		const meta = JSON.parse(uri.query) as {
			project?: string;
			changeID?: string;
			commit?: string;
			filePath?: string;
			isVirtual?: boolean;
			content?: string;
		};
		if (
			typeof meta.project !== 'string' ||
			typeof meta.changeID !== 'string' ||
			typeof meta.commit !== 'string' ||
			typeof meta.filePath !== 'string'
		) {
			throw new Error('Invalid file meta');
		}
		return new FileMeta(
			meta.project,
			meta.changeID,
			meta.commit,
			meta.filePath,
			meta.isVirtual,
			meta.content
		);
	}

	public static tryFrom(uri: Uri): FileMeta | null {
		try {
			return this.from(uri);
		} catch (e) {
			return null;
		}
	}

	public static createFileMeta(options: FileMetaCreate): FileMeta {
		return new this(
			options.project,
			options.changeID,
			options.commit,
			options.filePath,
			options.isVirtual,
			options.content
		);
	}

	protected toObj(): Record<string, string | boolean | number | null> {
		return {
			project: this.project,
			changeID: this.changeID,
			commit: this.commit,
			filePath: this.filePath,
			isVirtual: this.isVirtual,
			content: this.content,
		};
	}

	public isEmpty(): boolean {
		return (
			this.project === '' &&
			this.commit === '' &&
			this.filePath === '' &&
			this.changeID === ''
		);
	}

	public toString(): string {
		return JSON.stringify(this.toObj());
	}
}

export class FileMetaWithSideAndBase extends FileMeta {
	public side!: GerritCommentSide | 'BOTH';
	public baseRevision!: number | null;

	public static fromFileMeta(
		fileMeta: FileMeta,
		side: GerritCommentSide | 'BOTH',
		baseRevision: number | null
	): FileMetaWithSideAndBase {
		const meta = new FileMetaWithSideAndBase(
			fileMeta.project,
			fileMeta.changeID,
			fileMeta.commit,
			fileMeta.filePath,
			fileMeta.isVirtual,
			fileMeta.content
		);
		meta.side = side;
		meta.baseRevision = baseRevision;
		return meta;
	}

	public static override from(uri: Uri): FileMetaWithSideAndBase {
		const meta = JSON.parse(uri.query) as {
			side?: GerritCommentSide | 'BOTH';
			baseRevision?: number | null;
		};
		if (typeof meta.side !== 'string') {
			throw new Error('Invalid file meta');
		}
		if (
			typeof meta.baseRevision !== 'number' &&
			meta.baseRevision !== null
		) {
			throw new Error('Invalid base revision');
		}

		return this.fromFileMeta(
			FileMeta.from(uri),
			meta.side,
			meta.baseRevision
		);
	}

	public static createFileMetaWithSide(
		options: FileMetaCreate,
		side: GerritCommentSide | 'BOTH',
		baseRevision: number | null
	): FileMetaWithSideAndBase {
		return FileMetaWithSideAndBase.fromFileMeta(
			FileMeta.createFileMeta(options),
			side,
			baseRevision
		);
	}

	public static override tryFrom(uri: Uri): FileMetaWithSideAndBase | null {
		try {
			return this.from(uri);
		} catch (e) {
			return null;
		}
	}

	protected override toObj(): Record<string, string | boolean> {
		return {
			...super.toObj(),
			side: this.side,
		};
	}

	public toKey(): string {
		return `${this.project}/${this.changeID}/${this.commit}/${this.filePath}/${this.side}`;
	}
}

export class FileProvider implements TextDocumentContentProvider {
	public constructor(public context: ExtensionContext) {
		context.subscriptions.push(
			workspace.onDidCloseTextDocument((doc) => {
				if (doc.uri.scheme === GERRIT_FILE_SCHEME) {
					const meta = FileMeta.tryFrom(doc.uri);
					if (meta) {
						FileCache.delete(
							meta.project,
							meta.commit,
							meta.filePath
						);
					}
				}
			})
		);
	}

	public async provideTextDocumentContent(
		uri: Uri,
		token: CancellationToken
	): Promise<string | null> {
		const meta = FileMeta.tryFrom(uri);
		if (!meta) {
			return '';
		}

		if (meta.isVirtual) {
			return meta.content;
		}

		if (meta.isEmpty()) {
			return '';
		}

		const api = await getAPI();
		if (!api) {
			return null;
		}

		const content = await api.getFileContent(meta);

		if (!content || token.isCancellationRequested) {
			return null;
		}

		return content.getText();
	}
}
