import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { getGitReviewFile } from '../credentials/gitReviewFile';
import { GerritUser } from '../gerrit/gerritAPI/gerritUser';
import { getChangeID, isGerritCommit } from '../git/commit';
import { GerritAPIWith } from '../gerrit/gerritAPI/api';
import { setContextProp } from '../vscode/context';
import { GerritRepo } from '../gerrit/gerritRepo';
import { onChangeLastCommit } from '../git/git';
import { Data } from '../util/data';
import { Disposable } from 'vscode';

export function updateUploaderState(
	gerritReposD: Data<GerritRepo[]>
): Disposable {
	return onChangeLastCommit(gerritReposD, async (gerritRepo, commit) => {
		const isUploader = await (async () => {
			if (!commit || !isGerritCommit(commit)) {
				return false;
			}

			const changeID = getChangeID(commit);
			if (!changeID) {
				return false;
			}

			const gitReviewFile = await getGitReviewFile(gerritRepo);
			if (!gitReviewFile) {
				return false;
			}

			const [change, self] = await Promise.all([
				GerritChange.getChangeOnce(
					gerritReposD,
					{
						changeID: `${gitReviewFile.project}~${changeID}`,
						gerritRepo,
					},
					[GerritAPIWith.ALL_REVISIONS],
					{ allowFail: true }
				),
				await GerritUser.getSelf(gerritReposD, gerritRepo),
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
	});
}
