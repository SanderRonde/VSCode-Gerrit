import {
	ChangesTreeProvider,
	getChangesTreeProvider,
} from '../../views/activityBar/changes';
import { SearchResultsTreeProvider } from '../../views/activityBar/searchResults';
import { flatten, uniqueComplex } from '../util/util';
import { selectChange } from '../../views/statusBar';
import { setContextProp } from '../vscode/context';

export async function focusChange(): Promise<void> {
	const changeNumber = await selectChange();
	if (!changeNumber) {
		return;
	}

	// Get a list of everything that is currently rendered
	const rootTreeViews = ChangesTreeProvider.getInstances().map(
		(i) => i.rootViewProvider
	);
	const panels = flatten(rootTreeViews.map((r) => r.getLastChildren()));
	const changes = uniqueComplex(
		flatten(panels.map((p) => p.getRenderedChildren())),
		(i) => i.change.changeID
	);

	const match = changes.find((c) => c.change.number === changeNumber);
	const changesTreeProvider = getChangesTreeProvider();
	if (match && changesTreeProvider) {
		// Focus that
		await changesTreeProvider.reveal(match, {
			select: true,
			expand: true,
			focus: true,
		});
	} else {
		// Set value that opens it in the search panel
		await setContextProp('gerrit:searchChangeNumber', changeNumber);
		SearchResultsTreeProvider.clear();
		SearchResultsTreeProvider.refesh();
		SearchResultsTreeProvider.focus();
	}
}
