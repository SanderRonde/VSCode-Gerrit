import { GerritCommentSide } from '../../../../../lib/gerrit/gerritAPI/types';
import { commands, env, TextDocumentShowOptions, Uri, window } from 'vscode';
import { FileTreeView } from '../fileTreeView';
import path = require('path');
import { getAPI } from '../../../../../lib/gerrit/gerritAPI';

export async function openFileOnline(treeView: FileTreeView): Promise<void> {
	const api = await getAPI();
	if (!api) {
		void window.showErrorMessage(
			'Invalid API settings, failed to open file online'
		);
		return;
	}
	const revisions = await treeView.change.revisions();
	if (!revisions) {
		void window.showErrorMessage('Failed to build URL');
		return;
	}

	const revisionNumber = revisions[treeView.file.currentRevision].number;

	await env.openExternal(
		Uri.parse(
			api.getURL(
				`c/${treeView.change.project}/+/${treeView.change.number}/${revisionNumber}/${treeView.file.filePath}`,
				false
			)
		)
	);
}

export async function openModified(treeView: FileTreeView): Promise<void> {
	if (!treeView) {
		void window.showErrorMessage(
			'Modify content command invoked without file'
		);
		return;
	}

	const content = await treeView.file.getNewContent();
	if (!content) {
		void window.showErrorMessage('Failed to open modified content');
		return;
	}

	const uri = content.toVirtualFile(
		GerritCommentSide.RIGHT,
		treeView.patchsetBase
	);

	await commands.executeCommand(
		'vscode.open',
		uri,
		`${path.basename(treeView.filePath)} (modified)`,
		{
			preserveFocus: false,
			preview: true,
		} as TextDocumentShowOptions
	);
}

export async function openOriginal(treeView: FileTreeView): Promise<void> {
	if (!treeView) {
		void window.showErrorMessage(
			'Modify content command invoked without file'
		);
		return;
	}

	const content = await treeView.file.getOldContent();
	if (!content) {
		void window.showErrorMessage('Failed to open modified content');
		return;
	}

	const uri = content.toVirtualFile(
		GerritCommentSide.RIGHT,
		treeView.patchsetBase
	);

	await commands.executeCommand(
		'vscode.open',
		uri,
		`${path.basename(treeView.filePath)} (modified)`,
		{
			preserveFocus: false,
			preview: true,
		} as TextDocumentShowOptions
	);
}
