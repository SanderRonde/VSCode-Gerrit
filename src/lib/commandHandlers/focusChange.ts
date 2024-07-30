import {
	ChangesTreeProvider,
	getChangesTreeProvider,
} from '../../views/activityBar/changes';
import { RootTreeViewProvider } from '../../views/activityBar/changes/rootTreeView';
import { SearchResultsTreeProvider } from '../../views/activityBar/searchResults';
import { ChangeTreeView } from '../../views/activityBar/changes/changeTreeView';
import { selectChange } from '../../views/statusBar/currentChangeStatusBar';
import { ViewPanel } from '../../views/activityBar/changes/viewPanel';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';
import { flatten, uniqueComplex } from '../util/util';
import { setContextProp } from '../vscode/context';
import { GerritRepo } from '../gerrit/gerritRepo';
import { Data } from '../util/data';

export async function focusChange(
	gerritReposD: Data<GerritRepo[]>
): Promise<void> {
	const change = await selectChange(gerritReposD);
	if (!change) {
		return;
	}

	// Get a list of everything that is currently rendered
	const rootTreeViews = await Promise.all(
		ChangesTreeProvider.getInstances().map((i) => i.rootViewProvider)
	);

	const panels: ViewPanel[] = [];
	for (const rootTreeView of rootTreeViews) {
		const lastChildren = rootTreeView.getLastChildren();
		if (lastChildren.length === 0) {
			continue;
		}

		for (const lastChild of lastChildren) {
			if (lastChild instanceof RootTreeViewProvider) {
				panels.push(...lastChild.getLastChildren());
			} else {
				panels.push(lastChild);
			}
		}
	}
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
		(c) =>
			c.change.number === change.changeId &&
			c.change.gerritRepo.rootUri.toString() ===
				change.repo.rootUri.toString()
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
		await setContextProp('gerrit:searchChangeNumber', change.changeId);
		SearchResultsTreeProvider.setCurrent({
			type: 'changeNumber',
			changeNumber: change.changeId,
			repo: change.repo,
		});
		SearchResultsTreeProvider.clear();
		await SearchResultsTreeProvider.refesh();
		await SearchResultsTreeProvider.focus();
	}
}
