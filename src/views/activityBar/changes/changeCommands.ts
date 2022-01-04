import {
	commands,
	ConfigurationTarget,
	Disposable,
	window,
	Uri,
	env,
} from 'vscode';
import { getConfiguration } from '../../../lib/vscode/config';
import { EXTENSION_ID } from '../../../lib/util/constants';
import { gitCheckoutRemote } from '../../../lib/git/git';
import { getAPI } from '../../../lib/gerrit/gerritAPI';
import { ChangeTreeView } from './changeTreeView';
import { ChangesTreeProvider } from '../changes';

export function refreshChanges(): void {
	ChangesTreeProvider.refesh();
}

export async function configureChangeLists(): Promise<void> {
	await commands.executeCommand(
		'workbench.action.openSettings',
		`@ext:${EXTENSION_ID} changes`
	);
}

export function selectActiveView(): void {
	const config = getConfiguration();

	const selectedView = config.get('gerrit.selectedView');
	const changesViews = config.get('gerrit.changesViews');

	const possibleViews = changesViews.map((v) => v.title);

	const quickPick = window.createQuickPick();
	quickPick.items = possibleViews.map((v) => ({
		label: v,
	}));
	quickPick.activeItems = possibleViews.includes(selectedView)
		? [quickPick.items[possibleViews.indexOf(selectedView)]]
		: [];

	const disposables: Disposable[] = [];
	disposables.push(
		quickPick.onDidHide(() => {
			disposables.forEach((d) => void d.dispose());
		})
	);
	disposables.push(
		quickPick.onDidAccept(async () => {
			const selected = quickPick.activeItems[0].label;
			await config.update(
				'gerrit.selectedView',
				selected,
				ConfigurationTarget.Global
			);
			ChangesTreeProvider.refesh();
			quickPick.hide();
		})
	);

	quickPick.show();
}

export async function checkoutBranch(
	changeTreeView: ChangeTreeView
): Promise<void> {
	await gitCheckoutRemote(changeTreeView.changeID, true);
}

export async function openChangeOnline(
	changeTreeView: ChangeTreeView
): Promise<void> {
	const api = await getAPI();
	if (!api) {
		void window.showErrorMessage(
			'Invalid API settings, failed to open change online'
		);
		return;
	}

	const change = await changeTreeView.change;
	if (!change) {
		void window.showErrorMessage('Failed to fetch change');
		return;
	}

	const { number, project } = change;
	await env.openExternal(
		Uri.parse(api.getURL(`c/${project}/+/${number}`, false))
	);
}
