import { TextContent } from '../../../../../lib/gerrit/gerritAPI/gerritFile';

export class FileCache {
	private static _fileContentCache: Map<string, TextContent> = new Map();
	private static _getFileContentCacheKey(
		project: string,
		revision: string,
		path: string
	): string {
		return `${project}|${revision}|${path}`;
	}

	public static has(
		project: string,
		revision: string,
		path: string
	): boolean {
		return this._fileContentCache.has(
			this._getFileContentCacheKey(project, revision, path)
		);
	}

	public static get(
		project: string,
		revision: string,
		path: string
	): TextContent | null {
		return (
			this._fileContentCache.get(
				this._getFileContentCacheKey(project, revision, path)
			) ?? null
		);
	}

	public static set(
		project: string,
		revision: string,
		path: string,
		content: TextContent
	): void {
		this._fileContentCache.set(
			this._getFileContentCacheKey(project, revision, path),
			content
		);
	}

	public static delete(
		project: string,
		revision: string,
		path: string
	): void {
		this._fileContentCache.delete(
			this._getFileContentCacheKey(project, revision, path)
		);
	}

	public static clear(): void {
		this._fileContentCache.clear();
	}
}
