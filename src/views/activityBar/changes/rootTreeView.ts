import { getConfiguration } from '../../../lib/vscode/config';
import { ExtensionContext, TreeItem, window } from 'vscode';
import { TreeItemWithChildren } from '../shared/treeTypes';
import { configureChangeLists } from './changeCommands';
import { ChangesTreeProvider } from '../changes';
import { ViewPanel } from './viewPanel';

export class RootTreeViewProvider implements TreeItemWithChildren {
	private _lastChildren: ViewPanel[] = [];

	public constructor(
		private readonly _context: ExtensionContext,
		public readonly root: ChangesTreeProvider
	) {}

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

	public getLastChildren(): ViewPanel[] {
		return this._lastChildren;
	}

	public async getChildren(): Promise<ViewPanel[]> {
		const children = await (async () => {
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

			const selectedView = views.find(
				(view) => view.title === selectedTitle
			);
			if (!selectedView) {
				await RootTreeViewProvider.openConfigSettingsMessage(
					`Selected view "${selectedTitle}" does not exist, please check your settings`
				);
				return [];
			}

			return selectedView.panels.map((panel) => {
				return new ViewPanel(this._context, this, panel);
			});
		})();
		return (this._lastChildren = children);
	}
}
