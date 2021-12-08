import { GerritFile } from '../../../../../lib/gerrit/gerritAPI/gerritFile';

export class FilesCache {
	private static _fileContentCache: Map<string, GerritFile[]> = new Map();
	private static _getFileContentCacheKey(
		project: string,
		changeID: string,
		revision: number
	): string {
		return `${project}|${changeID}|${revision}`;
	}

	public static has(
		project: string,
		changeID: string,
		revision: number
	): boolean {
		return this._fileContentCache.has(
			this._getFileContentCacheKey(project, changeID, revision)
		);
	}

	public static get(
		project: string,
		changeID: string,
		revision: number
	): GerritFile[] | null {
		return (
			this._fileContentCache.get(
				this._getFileContentCacheKey(project, changeID, revision)
			) ?? null
		);
	}

	public static set(
		project: string,
		changeID: string,
		revision: number,
		files: GerritFile[]
	): void {
		this._fileContentCache.set(
			this._getFileContentCacheKey(project, changeID, revision),
			files
		);
	}

	public static delete(
		project: string,
		changeID: string,
		revision: number
	): void {
		this._fileContentCache.delete(
			this._getFileContentCacheKey(project, changeID, revision)
		);
	}

	public static clear(): void {
		this._fileContentCache.clear();
	}
}
