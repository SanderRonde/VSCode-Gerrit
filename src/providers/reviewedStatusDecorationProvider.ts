import {
	Event,
	EventEmitter,
	FileDecoration,
	FileDecorationProvider,
	Uri,
} from 'vscode';
import { GerritChange } from '../lib/gerrit/gerritAPI/gerritChange';
import { FileMeta, GERRIT_FILE_SCHEME } from './fileProvider';

class ReviewedStatusDecorationProvider implements FileDecorationProvider {
	private _onDidChangeFileDecorations: EventEmitter<Uri | Uri[]> =
		new EventEmitter<Uri | Uri[]>();
	public onDidChangeFileDecorations: Event<Uri | Uri[]> =
		this._onDidChangeFileDecorations.event;

	public async provideFileDecoration(
		uri: Uri
	): Promise<FileDecoration | undefined> {
		if (uri.scheme !== GERRIT_FILE_SCHEME) {
			return;
		}
		const meta = FileMeta.tryFrom(uri);
		if (!meta || meta.isEmpty()) {
			return;
		}

		const change = await GerritChange.getChangeOnce(meta.changeID);
		if (!change) {
			return;
		}
		const revision = await change.getCurrentRevision();
		if (!revision) {
			return;
		}
		const fileReviewStatusSubscription =
			await revision.getFileReviewStatus();
		fileReviewStatusSubscription.subscribeOnce(
			new WeakRef(() => this._onDidChangeFileDecorations.fire(uri)),
			{
				onInitial: false,
			}
		);
		const fileReviewStatus = await fileReviewStatusSubscription.getValue();
		if (!fileReviewStatus) {
			return;
		}
		const isReviewed = !!fileReviewStatus[meta.filePath];

		if (isReviewed) {
			return {
				propagate: false,
				tooltip: 'Reviewed',
				badge: '👁️',
			};
		}

		return;
	}
}

let reviewedStatusDecorationProvider: ReviewedStatusDecorationProvider | null =
	null;
export function getReviewedStatusDecorationProvider(): ReviewedStatusDecorationProvider {
	if (reviewedStatusDecorationProvider) {
		return reviewedStatusDecorationProvider;
	}
	return (reviewedStatusDecorationProvider =
		new ReviewedStatusDecorationProvider());
}
