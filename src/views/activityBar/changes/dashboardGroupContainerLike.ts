import {
	DefaultChangeFilter,
	GerritChangeFilter,
	offset,
	limit,
} from '../../../lib/gerritAPI/filters';
import { GerritChange } from '../../../lib/gerritAPI/gerritChange';
import { GerritAPIWith } from '../../../lib/gerritAPI/api';
import { TreeItemWithChildren } from '../treeTypes';
import { ChangeTreeView } from './changeTreeView';
import { Event, EventEmitter } from 'vscode';

export abstract class DashboardGroupContainerLike {
	private _onDidChangeTreeData: EventEmitter<
		DashboardGroupContainerLike | undefined | null | void
	> = new EventEmitter<
		DashboardGroupContainerLike | undefined | null | void
	>();
	public readonly onDidChangeTreeData: Event<
		DashboardGroupContainerLike | undefined | null | void
	> = this._onDidChangeTreeData.event;

	protected abstract getFilters(): (
		| DefaultChangeFilter
		| GerritChangeFilter
	)[];
	protected abstract getDefaultLimit(): number;

	private _fetched = 0;
	private _limit: number = this.getDefaultLimit();

	public refresh(): void {
		// TODO: add "refresh" button
		// TODO: add "fetch more" button
		this._onDidChangeTreeData.fire();
	}

	private async _fetch(): Promise<ChangeTreeView[]> {
		const changes = await Promise.all(
			(
				await GerritChange.getChanges(
					[
						[
							...this.getFilters(),
							offset(this._fetched),
							limit(this._limit - this._fetched),
						],
					],
					GerritAPIWith.DETAILED_ACCOUNTS
				)
			).map((change) => new ChangeTreeView(change))
		);
		this._fetched += changes.length;
		return changes;
	}

	public async getChildren(): Promise<TreeItemWithChildren[]> {
		return this._fetch();
	}
}
