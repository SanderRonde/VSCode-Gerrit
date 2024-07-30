import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { getAPIForRepo } from '../gerrit/gerritAPI';
import { GerritRepo } from '../gerrit/gerritRepo';
import { getCurrentChange } from '../git/commit';
import { env, Uri, window } from 'vscode';
import { Data } from '../util/data';

export async function openCurrentChangeOnline(
	gerritReposD: Data<GerritRepo[]>
): Promise<void> {
	const changeIDWithRepo = await getCurrentChange(gerritReposD.get(), 'warn');
	if (!changeIDWithRepo) {
		return;
	}
	const api = await getAPIForRepo(gerritReposD, changeIDWithRepo.gerritRepo);
	if (!changeIDWithRepo) {
		void window.showErrorMessage('Failed to find current change ID');
		return;
	}
	if (!api) {
		void window.showErrorMessage('Failed to connect to Gerrit API');
		return;
	}

	const change = await GerritChange.getChangeOnce(
		gerritReposD,
		changeIDWithRepo
	);
	if (!change) {
		void window.showErrorMessage('Failed to find current change');
		return;
	}
	await env.openExternal(
		Uri.parse(api.getURL(`c/${change.project}/+/${change.number}`, false))
	);
}
