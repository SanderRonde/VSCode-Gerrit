import {
	getQuickCheckoutSubscribable,
	QuickCheckoutApplyInfo,
} from '../../lib/git/quick-checkout';
import {
	ConfigurationTarget,
	ExtensionContext,
	StatusBarAlignment,
	window,
} from 'vscode';
import { storageGet, StorageScope, storageSet } from '../../lib/vscode/storage';
import { GerritExtensionCommands } from '../../commands/command-names';
import { getConfiguration } from '../../lib/vscode/config';
import { arrDiff } from '../../lib/util/util';

interface StatusBarEntry {
	update(newInfo: QuickCheckoutApplyInfo): void;
	dispose(): void;
}

function createSingleIcon(info: QuickCheckoutApplyInfo): StatusBarEntry {
	const statusBar = window.createStatusBarItem(StatusBarAlignment.Left, -1);

	statusBar.text = `$(history) ${info.originalBranch}`;

	const returnValue = {
		update(newInfo: QuickCheckoutApplyInfo) {
			statusBar.tooltip = `Jump back to ${
				newInfo.originalBranch
			} and apply stash ${newInfo.used ? ' (stash used before)' : ''}`;
			statusBar.command = {
				command: GerritExtensionCommands.QUICK_CHECKOUT_POP,
				arguments: [newInfo],
				title: statusBar.tooltip,
			};
		},
		dispose() {
			statusBar.dispose();
		},
	};
	returnValue.update(info);
	statusBar.show();
	return returnValue;
}

export function quickCheckoutEntryToKey(entry: QuickCheckoutApplyInfo): string {
	return `${entry.originalBranch}${entry.stashName ?? '-'}${
		entry.used ? 'used' : ''
	}`;
}

const entries: Map<string, StatusBarEntry> = new Map();
let isShowingQuestion: boolean = false;
async function shouldShowStatusBarEntries(): Promise<boolean | null> {
	if (
		!(await storageGet(
			'askedQuickCheckoutsStatusBar',
			StorageScope.GLOBAL,
			false
		))
	) {
		const YES_OPTION = 'Yes';
		const NO_OPTION = 'No';
		isShowingQuestion = true;
		const result = await window.showInformationMessage(
			'Should created quick checkouts be shown in the statusbar?',
			YES_OPTION,
			NO_OPTION
		);
		isShowingQuestion = false;

		if (result === YES_OPTION) {
			await getConfiguration().update(
				'gerrit.quickCheckout.showInStatusBar',
				true,
				ConfigurationTarget.Global
			);
		} else if (result === NO_OPTION) {
			await getConfiguration().update(
				'gerrit.quickCheckout.showInStatusBar',
				false,
				ConfigurationTarget.Global
			);
		} else {
			return null;
		}
		await storageSet(
			'askedQuickCheckoutsStatusBar',
			true,
			StorageScope.GLOBAL
		);
	}

	return getConfiguration().get(
		'gerrit.quickCheckout.showInStatusBar',
		false
	);
}

export async function showQuickCheckoutStatusBarIcons(
	context: ExtensionContext
): Promise<void> {
	const subscribable = getQuickCheckoutSubscribable();
	subscribable.subscribe(
		new WeakRef(async (infos) => {
			if (isShowingQuestion) {
				return;
			}

			if (infos.length > 0) {
				if (!(await shouldShowStatusBarEntries())) {
					context.subscriptions.splice(
						context.subscriptions.indexOf(subscribable),
						1
					);
					subscribable.dispose();
					return;
				}
			}

			const prevEntries = [...entries.keys()];
			const newEntries = infos.map((i) => quickCheckoutEntryToKey(i));

			const { added, removed, remained } = arrDiff(
				prevEntries,
				newEntries
			);
			for (const addedEntry of added) {
				const match = infos.find(
					(i) => quickCheckoutEntryToKey(i) === addedEntry
				)!;
				entries.set(addedEntry, createSingleIcon(match));
			}
			for (const removedEntry of removed) {
				entries.get(removedEntry)!.dispose();
				entries.delete(removedEntry);
			}
			for (const remainedEntry of remained) {
				const match = infos.find(
					(i) => quickCheckoutEntryToKey(i) === remainedEntry
				)!;
				entries.get(remainedEntry)!.update(match)!;
			}
		}),
		{
			onInitial: true,
		}
	);
	context.subscriptions.push(subscribable);
	await subscribable.getValue(true);
}
