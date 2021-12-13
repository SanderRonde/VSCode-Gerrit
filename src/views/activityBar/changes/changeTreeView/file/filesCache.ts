import { GerritFile } from '../../../../../lib/gerrit/gerritAPI/gerritFile';
import { CacheContainer } from '../../../../../lib/util/cache';

export class FilesCache extends CacheContainer<
	{
		project: string;
		changeID: string;
		revision: number;
	},
	GerritFile[],
	string
> {
	protected override getKey({
		changeID,
		project,
		revision,
	}: {
		project: string;
		changeID: string;
		revision: number;
	}): string {
		return `${project}|${changeID}|${revision}`;
	}
}

export const filesCache = new FilesCache();
