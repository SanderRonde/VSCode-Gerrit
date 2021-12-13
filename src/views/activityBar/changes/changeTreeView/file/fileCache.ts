import { TextContent } from '../../../../../lib/gerrit/gerritAPI/gerritFile';
import { CacheContainer } from '../../../../../lib/util/cache';

export class FileCache extends CacheContainer<
	{
		project: string;
		revision: string;
		path: string;
	},
	TextContent,
	string
> {
	protected override getKey({
		path,
		project,
		revision,
	}: {
		project: string;
		revision: string;
		path: string;
	}): string {
		return `${project}|${revision}|${path}`;
	}
}

export const fileCache = new FileCache();
