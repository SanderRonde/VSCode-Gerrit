import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { Repository } from '../../types/vscode-extension-git';
import { getChangeID, isGerritCommit } from '../git/commit';
import { GerritUser } from '../gerrit/gerritAPI/gerritUser';
import { GerritAPIWith } from '../gerrit/gerritAPI/api';
import { setContextProp } from '../vscode/context';
import { onChangeLastCommit } from '../git/git';
import { Disposable } from 'vscode';

export async function updateUploaderState(
	gerritRepo: Repository
): Promise<Disposable> {
	return await onChangeLastCommit(
		gerritRepo,
		async (commit) => {
			const isUploader = await (async () => {
				if (!commit || !isGerritCommit(commit)) {
					return false;
				}

				const changeID = getChangeID(commit);
				if (!changeID) {
					return false;
				}

				const [change, self] = await Promise.all([
					GerritChange.getChangeOnce(
						changeID,
						[GerritAPIWith.ALL_REVISIONS],
						{ allowFail: true }
					),
					await GerritUser.getSelf(),
				]);
				if (!change || !self) {
					return false;
				}

				if (change.owner._account_id === self.accountID) {
					return true;
				}

				for (const revision of Object.values(
					(await change.revisions()) ?? {}
				)) {
					if (revision.uploader._account_id === self.accountID) {
						return true;
					}
				}
				return false;
			})();
			await setContextProp('gerrit:isUploader', isUploader);
		},
		true
	);
}
