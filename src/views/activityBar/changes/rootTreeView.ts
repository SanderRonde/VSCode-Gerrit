import { TreeItemWithChildren, TreeViewItem } from '../treeTypes';
import { configureChangeLists } from './changeCommands';
import { getConfiguration } from '../../../lib/config';
import { ChangesTreeProvider } from '../changes';
import { TreeItem, window } from 'vscode';
import { ViewPanel } from './viewPanel';

export class RootTreeViewProvider implements TreeItemWithChildren {
	public constructor(protected readonly _root: ChangesTreeProvider) {}

	public static async openConfigSettingsMessage(
		message: string
	): Promise<void> {
		const openSettingsOption = 'Open settings';
		await window
			.showErrorMessage(message, openSettingsOption)
			.then(async (selection) => {
				if (selection === openSettingsOption) {
					await configureChangeLists();
				}
			});
	}

	public getItem(): Promise<TreeItem> {
		return Promise.resolve({});
	}

	public async getChildren(): Promise<TreeViewItem[]> {
		const views = getConfiguration().get('gerrit.changesViews', []);
		if (views.length === 0) {
			await RootTreeViewProvider.openConfigSettingsMessage(
				'No views configured, please do so in the settings'
			);
			return [];
		}

		const selectedTitle = getConfiguration().get(
			'gerrit.selectedView',
			views[0].title
		);

		const selectedView = views.find((view) => view.title === selectedTitle);
		if (!selectedView) {
			await RootTreeViewProvider.openConfigSettingsMessage(
				`Selected view "${selectedTitle}" does not exist, please check your settings`
			);
			return [];
		}

		return selectedView.panels.map((panel) => {
			return new ViewPanel(this._root, panel);
		});
	}
}
