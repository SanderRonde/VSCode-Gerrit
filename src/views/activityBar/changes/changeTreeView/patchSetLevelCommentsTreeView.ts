import { Command, TextDocumentShowOptions, ThemeIcon, TreeItem } from 'vscode';
import { GerritChange } from '../../../../lib/gerrit/gerritAPI/gerritChange';
import { TextContent } from '../../../../lib/gerrit/gerritAPI/gerritFile';
import { TreeItemWithoutChildren } from '../../shared/treeTypes';
import { FileMeta } from '../../../../providers/fileProvider';

export const PATCHSET_LEVEL_KEY = '/PATCHSET_LEVEL';

export class PatchSetLevelCommentsTreeView implements TreeItemWithoutChildren {
	public constructor(public change: GerritChange) {}

	public static async isVisible(change: GerritChange): Promise<boolean> {
		const comments = await GerritChange.getAllCommentsCached(change.id);
		const patchsetComments = comments.get(PATCHSET_LEVEL_KEY);
		return !!patchsetComments && patchsetComments.length > 0;
	}

	private async _createCommand(): Promise<Command | null> {
		// We create a file that has N number of lines, where N = number of comments.
		// That way we can place one comment on every line
		const comments = await GerritChange.getAllCommentsCached(
			this.change.id
		);
		const revision = await this.change.currentRevisionStr();
		if (!revision) {
			return null;
		}

		const patchsetComments = comments.get(PATCHSET_LEVEL_KEY)!;
		const fileContent = new Array(patchsetComments.length)
			.fill('')
			.join('\n');
		const file = TextContent.from(
			FileMeta.createFileMeta({
				project: this.change.project,
				changeID: this.change.id,
				commit: revision,
				filePath: PATCHSET_LEVEL_KEY,
				isVirtual: true,
				content: fileContent,
			}),
			fileContent,
			'utf8'
		);

		const uri = file.toVirtualFile('BOTH', null);

		return {
			command: 'vscode.open',
			arguments: [
				uri,
				{
					preserveFocus: false,
					preview: true,
				} as TextDocumentShowOptions,
				'PatchSet Level Comments',
			],
			title: 'Open changed file',
		};
	}

	public async getItem(): Promise<TreeItem> {
		return {
			label: 'Patch-level comments',
			tooltip: `View change #${this.change.number}'s patch-level comments`,
			contextValue: 'view-patch-level',
			iconPath: new ThemeIcon('comment-discussion'),
			command: (await this._createCommand()) ?? undefined,
		};
	}
}
