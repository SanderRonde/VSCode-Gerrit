import {
	commands,
	Position,
	ProviderResult,
	Selection,
	Uri,
	UriHandler,
	window,
} from 'vscode';
import { FileTreeView } from '../views/activityBar/changes/changeTreeView/fileTreeView';
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { Repository } from '../types/vscode-extension-git';
import { gitCheckoutRemote } from '../lib/git/git';
import { tryExecAsync } from '../lib/git/gitCLI';

export class URIHandler implements UriHandler {
	public constructor(private readonly _gerritRepo: Repository) {}

	private async _handleChangeCheckout(query: {
		checkout?: string;
		change?: string;
		patchSet?: `${number}`;
		file?: string;
		line?: `${number}`;
	}): Promise<void> {
		const { changeID, change } = await (async (): Promise<{
			changeID: string | undefined;
			changeNumber: number | undefined;
			change: GerritChange | undefined;
		}> => {
			if (!query.change) {
				return {
					changeNumber: undefined,
					changeID: undefined,
					change: undefined,
				};
			}

			const change = await GerritChange.getChangeOnce(query.change, []);
			return {
				changeNumber: change?.number,
				changeID: change?.change_id,
				change: change ?? undefined,
			};
		})();

		if (changeID && query.checkout) {
			// If set, checkout change, if not, stay on master and diff
			if (
				!(await gitCheckoutRemote(
					this._gerritRepo,
					changeID,
					query.patchSet ? Number(query.patchSet) : undefined,
					false
				))
			) {
				return;
			}
		}

		if (query.file) {
			if (
				!query.checkout &&
				changeID &&
				change &&
				!(await this._isInCurrentTree(change, Number(query.patchSet)))
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
				const cmd = await FileTreeView.createDiffCommand(
					this._gerritRepo,
					file,
					null
				);
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
				await commands.executeCommand(
					'vscode.open',
					Uri.joinPath(this._gerritRepo.rootUri, query.file)
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

	private async _isInCurrentTree(
		change: GerritChange,
		patchSet?: number
	): Promise<boolean> {
		const revisions = await change.revisions();
		if (!revisions) {
			return false;
		}
		const revision =
			patchSet !== undefined
				? Object.values(revisions).find(
						(revision) => revision.number === patchSet
					)
				: await change.getCurrentRevision();
		if (!revision) {
			return false;
		}

		// Check if git hash of the revision is somewhere in the git log
		const proc = await tryExecAsync(
			`git merge-base --is-ancestor ${revision.revisionID} HEAD`,
			{
				cwd: this._gerritRepo.rootUri.fsPath,
			}
		);
		return proc.success;
	}

	public handleUri(uri: Uri): ProviderResult<void> {
		const parsedQuery: Record<string, string> = {};
		uri.query.split('&').forEach((pair) => {
			const [key, value] = pair.split('=');
			parsedQuery[key] = value || '1';
		});

		void this._handleChangeCheckout({
			...parsedQuery,
			patchSet: (parsedQuery.patchSet ??
				parsedQuery.patchset) as `${number}`,
		});

		return undefined;
	}
}
