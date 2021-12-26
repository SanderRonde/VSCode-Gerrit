import { ChangeTreeView } from '../../views/activityBar/changes/changeTreeView';
import { ensureCleanWorkingTree, getCurrentBranch } from './git';
import { execAsync, tryExecAsync } from './gitCLI';
import { window } from 'vscode';

async function createStash(stashName: string): Promise<boolean> {
	if (!(await tryExecAsync(`git stash push -u -m "${stashName}"`)).success) {
		void window.showErrorMessage(
			'Failed to create stash, see log for details'
		);
		return false;
	}
	return true;
}

async function applyGitStash(stashName: string): Promise<boolean> {
	const { success: listSuccess, stdout } = await tryExecAsync(
		'git stash list'
	);
	if (!listSuccess) {
		void window.showErrorMessage(
			'Failed to read stashes, see log for details'
		);
		return false;
	}
	const stashes = stdout.split('\n').map((l) => l.trim());
	const line = stashes.find((stash) => {
		return stash.split(':')[2].trim() === stashName;
	});
	if (!line) {
		void window.showErrorMessage(
			'Failed to find stash, see log for details'
		);
		return false;
	} else {
		const { success: applySuccess } = await tryExecAsync(
			`git stash apply ${line.split(':')[0]}`
		);
		if (!applySuccess) {
			void window.showErrorMessage(
				'Failed to apply stash, see log for details'
			);
			return false;
		}
	}
	return true;
}

interface QuickCheckoutApplyInfo {
	originalBranch: string;
	stashName?: string;
}

export async function quickCheckout(
	changeTreeView: ChangeTreeView
): Promise<void> {
	// Check if we have any working tree changes at all. If not, no
	// need to stash
	const hasChanges = !(await ensureCleanWorkingTree(true));

	const currentBranch = await getCurrentBranch();
	if (!currentBranch) {
		void window.showErrorMessage('Failed to get current branch');
		return;
	}

	const applyInfo: QuickCheckoutApplyInfo = {
		originalBranch: currentBranch,
	};
	if (hasChanges) {
		const stashName = `${currentBranch} - ${Date.now()}`;
		if (!(await createStash(stashName))) {
			return;
		}

		applyInfo.stashName = stashName;
	}

	
}
