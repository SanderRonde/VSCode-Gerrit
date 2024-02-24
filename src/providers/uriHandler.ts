import {
	commands,
	Position,
	ProviderResult,
	Selection,
	Uri,
	UriHandler,
	window,
	workspace,
} from 'vscode';
import { FileTreeView } from '../views/activityBar/changes/changeTreeView/fileTreeView';
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { getCurrentChangeID, isChangeID } from '../lib/git/commit';
import { gitCheckoutRemote } from '../lib/git/git';

export class URIHandler implements UriHandler {
	private async _handleChangeCheckout(query: {
		checkout?: string;
		changeID?: string;
		patchSet?: `${number}`;
		file?: string;
		line?: `${number}`;
	}): Promise<void> {
		if (query.changeID && query.checkout) {
			// If set, checkout change, if not, stay on master and diff
			if (
				!(await gitCheckoutRemote(
					query.changeID,
					query.patchSet ? Number(query.patchSet) : undefined,
					false
				))
			) {
				return;
			}
		}

		if (query.file) {
			const changeID = query.changeID;
			if (
				!query.checkout &&
				changeID &&
				isChangeID(changeID) &&
				!(await this._isCurrentChange(changeID))
			) {
				// Diff against this
				const revision = await (async () => {
					const change = await GerritChange.getChangeOnce(
						changeID,
						[]
					);
					if (!query.patchSet) {
						return change?.getCurrentRevision();
					}
					const revisions = await change?.revisions();
					return Object.values(revisions ?? {}).find(
						(revision) => String(revision.number) === query.patchSet
					);
				})();
				if (!revision) {
					void window.showErrorMessage('Could not find the patchset');
					return;
				}

				const files = await (await revision.files()).getValue();
				const file = files[query.file];
				if (!file) {
					void window.showErrorMessage(
						'Could not find requested file'
					);
					return;
				}
				const cmd = await FileTreeView.createDiffCommand(file, null);
				if (!cmd) {
					void window.showErrorMessage(
						'Could not create diff command'
					);
					return;
				}
				await commands.executeCommand(
					cmd.command,
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					...(cmd.arguments ?? [])
				);
			} else {
				const workspaceFolder = workspace.workspaceFolders?.[0].uri;
				if (!workspaceFolder) {
					void window.showErrorMessage(
						'Could not find workspace folder'
					);
					return;
				}
				await commands.executeCommand(
					'vscode.open',
					Uri.joinPath(workspaceFolder, query.file)
				);
			}
		}
		if (query.line) {
			// VSCode is 0-based, the user is likely not
			const lineNum = Number(query.line) - 1;
			if (window.activeTextEditor) {
				window.activeTextEditor.selection = new Selection(
					new Position(lineNum, 0),
					new Position(lineNum, 0)
				);
			}
			await commands.executeCommand('revealLine', {
				lineNumber: lineNum,
				at: 'center',
			});
		}
	}

	private async _isCurrentChange(changeID: string): Promise<boolean> {
		const currentChangeID = await getCurrentChangeID();
		if (!currentChangeID) {
			return false;
		}
		return currentChangeID === changeID;
	}

	public handleUri(uri: Uri): ProviderResult<void> {
		const parsedQuery: Record<string, string> = {};
		uri.query.split('&').forEach((pair) => {
			const [key, value] = pair.split('=');
			parsedQuery[key] = value || '1';
		});

		void this._handleChangeCheckout(parsedQuery);

		return undefined;
	}
}
