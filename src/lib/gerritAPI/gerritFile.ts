import {
	GerritRevisionFile,
	GerritRevisionFileStatus,
} from '../../types/gerritAPI';
import { DynamicallyFetchable } from './shared';

export class GerritFile extends DynamicallyFetchable {
	public linesInserted: number;
	public linesDeleted: number;
	public sizeDelta: number;
	public size: number;
	public status: GerritRevisionFileStatus | null;
	public oldPath: string | null;

	constructor(
		protected _id: string,
		public currentRevision: string,
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
}
