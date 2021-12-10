import {
	CancellationToken,
	ExtensionContext,
	TextDocumentContentProvider,
	Uri,
	workspace,
} from 'vscode';
import { FileCache } from '../views/activityBar/changes/changeTreeView/file/fileCache';
import { PatchsetDescription } from '../views/activityBar/changes/changeTreeView';
import { GerritCommentSide } from '../lib/gerrit/gerritAPI/types';
import { getAPI } from '../lib/gerrit/gerritAPI';

export const GERRIT_FILE_SCHEME = 'gerrit-file';

export interface FileMetaCreate {
	project: string;
	changeID: string;
	commit: PatchsetDescription;
	filePath: string;
	isVirtual?: boolean;
	content?: string;
	extra?: string;
}

export class FileMeta {
	public static PATCHSET_LEVEL = new FileMeta(
		'',
		'',
		{
			id: '',
			number: -1,
		},
		''
	);
	public static EMPTY = new FileMeta(
		'',
		'',
		{
			id: '',
			number: -1,
		},
		''
	);

	protected constructor(
		public project: string,
		public changeID: string,
		public commit: PatchsetDescription,
		public filePath: string,
		public isVirtual: boolean = false,
		public content: string = '',
		public extra: string = ''
	) {}

	public static from(uri: Uri): FileMeta {
		const meta = JSON.parse(uri.query) as {
			project?: string;
			changeID?: string;
			commit?: PatchsetDescription;
			filePath?: string;
			isVirtual?: boolean;
			content?: string;
			extra?: string;
		};
		if (
			typeof meta.project !== 'string' ||
			typeof meta.changeID !== 'string' ||
			!meta.commit ||
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
			meta.content,
			meta.extra
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
			options.content,
			options.extra
		);
	}

	protected toObj(): Record<string, unknown> {
		return {
			project: this.project,
			changeID: this.changeID,
			commit: this.commit,
			filePath: this.filePath,
			isVirtual: this.isVirtual,
			content: this.content,
			extra: this.extra,
		};
	}

	public isEmpty(): boolean {
		return (
			this.project === '' &&
			this.commit.id === '' &&
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
	public baseRevision!: PatchsetDescription | null;

	public static fromFileMeta(
		fileMeta: FileMeta,
		side: GerritCommentSide | 'BOTH',
		baseRevision: PatchsetDescription | null
	): FileMetaWithSideAndBase {
		const meta = new FileMetaWithSideAndBase(
			fileMeta.project,
			fileMeta.changeID,
			fileMeta.commit,
			fileMeta.filePath,
			fileMeta.isVirtual,
			fileMeta.content,
			fileMeta.extra
		);
		meta.side = side;
		meta.baseRevision = baseRevision;
		return meta;
	}

	public static override from(uri: Uri): FileMetaWithSideAndBase {
		const meta = JSON.parse(uri.query) as {
			side?: GerritCommentSide | 'BOTH';
			baseRevision?: PatchsetDescription | null;
		};
		if (typeof meta.side !== 'string') {
			throw new Error('Invalid file meta');
		}
		if (
			typeof meta.baseRevision !== 'object' &&
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
		baseRevision: PatchsetDescription | null
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

	protected override toObj(): Record<string, unknown> {
		return {
			...super.toObj(),
			side: this.side,
			baseRevision: this.baseRevision,
		};
	}

	public toKey(): string {
		return `${this.project}/${this.changeID}/${this.commit.id}/${this.filePath}/${this.side}`;
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
							meta.commit.id,
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
		console.log('content for', uri);
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
