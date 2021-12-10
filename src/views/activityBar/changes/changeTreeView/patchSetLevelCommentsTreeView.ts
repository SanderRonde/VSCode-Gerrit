import {
	CommentMap,
	GerritChange,
} from '../../../../lib/gerrit/gerritAPI/gerritChange';
import { GerritCommentBase } from '../../../../lib/gerrit/gerritAPI/gerritComment';
import { Command, TextDocumentShowOptions, ThemeIcon, TreeItem } from 'vscode';
import { DocumentCommentManager } from '../../../../providers/commentProvider';
import { TextContent } from '../../../../lib/gerrit/gerritAPI/gerritFile';
import { TreeItemWithoutChildren } from '../../shared/treeTypes';
import { FileMeta } from '../../../../providers/fileProvider';
import { PatchsetDescription } from '../changeTreeView';

export const PATCHSET_LEVEL_KEY = '/PATCHSET_LEVEL';

export class PatchSetLevelCommentsTreeView implements TreeItemWithoutChildren {
	public constructor(public change: GerritChange) {}

	public static async isVisible(change: GerritChange): Promise<boolean> {
		const comments = await GerritChange.getAllCommentsCached(change.id);
		const patchsetComments = comments.get(PATCHSET_LEVEL_KEY);
		return !!patchsetComments && patchsetComments.length > 0;
	}

	public static createCommand(
		change: {
			project: string;
			id: string;
		},
		revision: PatchsetDescription,
		threads: GerritCommentBase[][]
	): Command {
		const fileContent = new Array(threads.length).fill('').join('\n');
		const file = TextContent.from(
			FileMeta.createFileMeta({
				project: change.project,
				changeID: change.id,
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

	private async _createCommand(): Promise<Command | null> {
		// We create a file that has N number of lines, where N = number of comments.
		// That way we can place one comment on every line
		const comments = await GerritChange.getAllCommentsCached(
			this.change.id
		);
		const revision = await this.change.currentRevision();
		if (!revision) {
			return null;
		}

		return PatchSetLevelCommentsTreeView.createCommand(
			this.change,
			revision,
			DocumentCommentManager.buildThreadsFromComments(
				comments.get(PATCHSET_LEVEL_KEY)!
			)
		);
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
