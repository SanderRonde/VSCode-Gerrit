import {
	FileMeta,
	FileMetaWithSideAndBase,
	GERRIT_FILE_SCHEME,
} from '../../../providers/fileProvider';
import {
	GerritCommentSide,
	GerritRevisionFile,
	GerritRevisionFileStatus,
} from './types';
import { PatchsetDescription } from '../../../views/activityBar/changes/changeTreeView';
import { Repository } from '../../../types/vscode-extension-git';
import { DynamicallyFetchable } from './shared';
import { GerritChange } from './gerritChange';
import { Uri, workspace } from 'vscode';
import { getAPI } from '../gerritAPI';
import { GerritAPIWith } from './api';

export class TextContent {
	private constructor(
		public buffer: Buffer,
		public meta: FileMeta
	) {}

	public static from(
		meta: FileMeta,
		content: string,
		encoding: BufferEncoding
	): TextContent {
		return new TextContent(Buffer.from(content, encoding), meta);
	}

	public getText(): string {
		return this.buffer.toString('utf8');
	}

	public toVirtualFile(
		forSide: GerritCommentSide | 'BOTH',
		baseRevision: PatchsetDescription | null,
		context: string[],
		extra?: string
	): Uri {
		return Uri.from({
			scheme: GERRIT_FILE_SCHEME,
			path: this.meta.filePath,
			query: FileMetaWithSideAndBase.fromFileMeta(
				FileMeta.createFileMeta({
					...this.meta,
					context: [...this.meta.context, ...context],
					extra,
				}),
				forSide,
				baseRevision
			).toString(),
		});
	}

	public isEmpty(): boolean {
		return this.meta.isEmpty();
	}
}

export class GerritFile extends DynamicallyFetchable {
	public linesInserted: number;
	public linesDeleted: number;
	public sizeDelta: number;
	public size: number;
	public status: GerritRevisionFileStatus | null;
	public oldPath: string | null;

	public constructor(
		public override changeID: string,
		public readonly changeProject: string,
		public currentRevision: PatchsetDescription,
		public filePath: string,
		response: GerritRevisionFile
	) {
		super();
		this.linesInserted = response.lines_inserted;
		this.linesDeleted = response.lines_deleted;
		this.sizeDelta = response.size_delta;
		this.size = response.size;
		this.status = response.status ?? null;
		this.oldPath = response.old_path ?? null;
	}

	public async getNewContent(): Promise<TextContent | null> {
		return this.getContent(this.currentRevision);
	}

	public async getOldContent(): Promise<TextContent | null> {
		const change = await GerritChange.getChangeOnce(this.changeID);
		if (!change) {
			return null;
		}
		const commit = await change.getCurrentCommit(
			GerritAPIWith.CURRENT_FILES
		);
		if (!commit) {
			return null;
		}

		return this.getContent(
			{
				id: commit.parents[commit.parents.length - 1].commit,
				number: 0,
			},
			true
		);
	}

	public async getContent(
		revision: PatchsetDescription = this.currentRevision,
		useOldPath = false
	): Promise<TextContent | null> {
		const filePath = useOldPath
			? this.oldPath ?? this.filePath
			: this.filePath;
		const api = await getAPI();
		if (!api) {
			return null;
		}

		const content = await api.getFileContent({
			project: this.changeProject,
			commit: revision,
			changeID: this.changeID,
			filePath,
		});
		if (!content) {
			return null;
		}

		return content;
	}

	public getLocalURI(
		gerritRepo: Repository,
		forSide: GerritCommentSide,
		forBaseRevision: PatchsetDescription | null,
		context: string[],
		extra?: string
	): Uri | null {
		const filePath = Uri.joinPath(gerritRepo.rootUri, this.filePath);
		return filePath.with({
			query: FileMetaWithSideAndBase.createFileMetaWithSideAndRevision(
				{
					project: this.changeProject,
					commit: this.currentRevision,
					filePath: this.filePath,
					changeID: this.changeID,
					context,
					extra,
				},
				forSide,
				forBaseRevision
			).toString(),
		});
	}

	public async isLocalFile(
		gerritRepo: Repository,
		content: TextContent
	): Promise<boolean> {
		const filePath = this.getLocalURI(
			gerritRepo,
			GerritCommentSide.LEFT,
			null,
			[]
		);
		if (!filePath) {
			return false;
		}
		const stat = await (async () => {
			try {
				return await workspace.fs.stat(filePath);
			} catch (e) {
				return false;
			}
		})();
		if (!stat) {
			return false;
		}

		const fileContent = await workspace.fs.readFile(filePath);
		return (
			stat.size === content.buffer.length &&
			content.buffer.equals(fileContent)
		);
	}
}
