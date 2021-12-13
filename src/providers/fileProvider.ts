import {
	CancellationToken,
	ExtensionContext,
	TextDocumentContentProvider,
	Uri,
	workspace,
} from 'vscode';
import { fileCache } from '../views/activityBar/changes/changeTreeView/file/fileCache';
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
	context?: string[];
	content?: string;
	extra?: string;
}

interface FileMetaCreateWithSideAndBase extends FileMetaCreate {
	side: GerritCommentSide | 'BOTH';
	baseRevision: PatchsetDescription | null;
}

export class FileMeta implements FileMetaCreate {
	public static PATCHSET_LEVEL = new FileMeta(
		'',
		'',
		{
			id: '',
			number: -1,
		},
		'',
		[]
	);
	public static EMPTY = new FileMeta(
		'',
		'',
		{
			id: '',
			number: -1,
		},
		'',
		[]
	);

	protected constructor(
		public project: string,
		public changeID: string,
		public commit: PatchsetDescription,
		public filePath: string,
		public context: string[] = [],
		public isVirtual: boolean = false,
		public content: string = '',
		public extra: string = ''
	) {}

	public static from(uri: Uri): FileMeta {
		const meta = JSON.parse(uri.query) as Partial<FileMetaCreate>;
		if (
			typeof meta.project !== 'string' ||
			typeof meta.changeID !== 'string' ||
			!meta.commit ||
			typeof meta.filePath !== 'string' ||
			!Array.isArray(meta.context)
		) {
			throw new Error('Invalid file meta');
		}
		return new FileMeta(
			meta.project,
			meta.changeID,
			meta.commit,
			meta.filePath,
			meta.context,
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
			options.context,
			options.isVirtual,
			options.content,
			options.extra
		);
	}

	protected toObj(): FileMetaCreate {
		return {
			project: this.project,
			changeID: this.changeID,
			commit: this.commit,
			filePath: this.filePath,
			isVirtual: this.isVirtual,
			content: this.content,
			extra: this.extra,
			context: this.context.map((c) => `_ctx_${c}`),
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

export class FileMetaWithSideAndBase
	extends FileMeta
	implements FileMetaCreateWithSideAndBase
{
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
			fileMeta.context,
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

	public static createFileMetaWithSideAndRevision(
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

	protected override toObj(): FileMetaCreateWithSideAndBase {
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
						fileCache.delete({
							project: meta.project,
							path: meta.filePath,
							revision: meta.commit.id,
						});
					}
				}
			})
		);
	}

	public static async provideMetaContent(
		meta: FileMeta,
		token?: CancellationToken
	): Promise<string | null> {
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

		if (!content || token?.isCancellationRequested) {
			return null;
		}

		return content.getText();
	}

	public async provideTextDocumentContent(
		uri: Uri,
		token: CancellationToken
	): Promise<string | null> {
		const meta = FileMeta.tryFrom(uri);
		if (!meta) {
			return '';
		}

		return await FileProvider.provideMetaContent(meta, token);
	}
}
