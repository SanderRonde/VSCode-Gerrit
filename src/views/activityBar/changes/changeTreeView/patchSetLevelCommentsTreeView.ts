import { GerritCommentBase } from '../../../../lib/gerrit/gerritAPI/gerritComment';
import { DocumentCommentManager } from '../../../../providers/commentProvider';
import { Command, TextDocumentShowOptions, ThemeIcon, TreeItem } from 'vscode';
import { OPEN_FILE_IS_PATCHSET_LEVEL_FILE } from '../../../../lib/util/magic';
import { GerritChange } from '../../../../lib/gerrit/gerritAPI/gerritChange';
import { TextContent } from '../../../../lib/gerrit/gerritAPI/gerritFile';
import { GerritAPIWith } from '../../../../lib/gerrit/gerritAPI/api';
import { TreeItemWithoutChildren } from '../../shared/treeTypes';
import { SearchResultsTreeProvider } from '../../searchResults';
import { FileMeta } from '../../../../providers/fileProvider';
import { PatchsetDescription } from '../changeTreeView';
import { ViewPanel } from '../viewPanel';

export const PATCHSET_LEVEL_KEY = '/PATCHSET_LEVEL';

export class PatchSetLevelCommentsTreeView implements TreeItemWithoutChildren {
	public constructor(
		public changeID: string,
		private readonly _changeNumber: number,
		private readonly _parent: ViewPanel | SearchResultsTreeProvider
	) {}

	public static async isVisible(change: GerritChange): Promise<boolean> {
		const comments = await (
			await GerritChange.getAllComments(change.id)
		).getValue();
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

		const uri = file.toVirtualFile('BOTH', null, [
			OPEN_FILE_IS_PATCHSET_LEVEL_FILE,
		]);

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
		const commentSubscription = await GerritChange.getAllComments(
			this.changeID
		);
		const changeSubscription = await GerritChange.getChange(this.changeID, [
			GerritAPIWith.CURRENT_REVISION,
		]);

		[changeSubscription, commentSubscription].map((s) =>
			s.subscribeOnce(new WeakRef(() => this._parent.reload()))
		);
		const [change, comments] = await Promise.all([
			changeSubscription.getValue(),
			commentSubscription.getValue(),
		]);
		const revision = await change?.currentRevision();
		if (!revision) {
			return null;
		}

		return PatchSetLevelCommentsTreeView.createCommand(
			{
				id: this.changeID,
				project: change!.project,
			},
			revision,
			DocumentCommentManager.buildThreadsFromComments(
				comments.get(PATCHSET_LEVEL_KEY)!
			)
		);
	}

	public async getItem(): Promise<TreeItem> {
		return {
			label: 'Patch-level comments',
			tooltip: `View change #${this._changeNumber}'s patch-level comments`,
			contextValue: 'view-patch-level',
			iconPath: new ThemeIcon('comment-discussion'),
			command: (await this._createCommand()) ?? undefined,
		};
	}
}
