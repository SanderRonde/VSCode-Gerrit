import { commands, env, TextDocumentShowOptions, Uri, window } from 'vscode';
import { GerritCommentSide } from '../../../../../lib/gerritAPI/types';
import { FileTreeView } from '../fileTreeView';
import path = require('path');
import { getAPI } from '../../../../../lib/gerritAPI';

export async function openFileOnline(treeView: FileTreeView): Promise<void> {
	const api = await getAPI();
	if (!api) {
		await window.showErrorMessage(
			'Invalid API settings, failed to open file online'
		);
		return;
	}
	const revisions = await treeView.change.revisions();
	if (!revisions) {
		await window.showErrorMessage('Failed to build URL');
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
		await window.showErrorMessage(
			'Modify content command invoked without file'
		);
		return;
	}

	const content = await treeView.file.getNewContent();
	if (!content) {
		await window.showErrorMessage('Failed to open modified content');
		return;
	}

	const uri = content.toVirtualFile(GerritCommentSide.RIGHT);

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
		await window.showErrorMessage(
			'Modify content command invoked without file'
		);
		return;
	}

	const content = await treeView.file.getOldContent();
	if (!content) {
		await window.showErrorMessage('Failed to open modified content');
		return;
	}

	const uri = content.toVirtualFile(GerritCommentSide.RIGHT);

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
