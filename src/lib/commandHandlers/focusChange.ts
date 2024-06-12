import {
	ChangesTreeProvider,
	getChangesTreeProvider,
} from '../../views/activityBar/changes';
import { SearchResultsTreeProvider } from '../../views/activityBar/searchResults';
import { ChangeTreeView } from '../../views/activityBar/changes/changeTreeView';
import { selectChange } from '../../views/statusBar/currentChangeStatusBar';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { Repository } from '../../types/vscode-extension-git';
import { flatten, uniqueComplex } from '../util/util';
import { setContextProp } from '../vscode/context';

export async function focusChange(gerritRepo: Repository): Promise<void> {
	const changeNumber = await selectChange(gerritRepo);
	if (!changeNumber) {
		return;
	}

	// Get a list of everything that is currently rendered
	const rootTreeViews = ChangesTreeProvider.getInstances().map(
		(i) => i.rootViewProvider
	);
	const panels = flatten(rootTreeViews.map((r) => r.getLastChildren()));
	const panelChanges = flatten(
		await Promise.all(
			panels.map(async (p) =>
				Promise.all(
					(await p.getRenderedChildren()).map(async (c) => ({
						tree: c,
						change: await c.change,
					}))
				)
			)
		)
	).filter(
		(
			c
		): c is {
			tree: ChangeTreeView;
			change: GerritChange;
		} => !!c
	);
	const changes = uniqueComplex(panelChanges, (i) => i.change.changeID);

	const match = changes.find(
		(c) => c.change.number === changeNumber.changeId
	);
	const changesTreeProvider = getChangesTreeProvider();
	if (match && changesTreeProvider) {
		// Focus that
		await changesTreeProvider.reveal(match.tree, {
			select: true,
			expand: true,
			focus: true,
		});
	} else {
		// Set value that opens it in the search panel
		await setContextProp(
			'gerrit:searchChangeNumber',
			changeNumber.changeId
		);
		SearchResultsTreeProvider.clear();
		SearchResultsTreeProvider.refesh();
		SearchResultsTreeProvider.focus();
	}
}
