import { commands, ConfigurationTarget, Disposable, window } from 'vscode';
import { getConfiguration } from '../../../lib/vscode/config';
import { EXTENSION_ID } from '../../../lib/util/constants';
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
