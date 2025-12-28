import {
	APISubscriptionManagerEntry,
	APISubSubscriptionManagerBase,
	MATCH_ANY,
	WithMatchAny,
} from './baseSubscriptions';
import { PatchsetDescription } from '../../views/activityBar/changes/changeTreeView';

interface ChangeSubscriptionsManagerConfig {
	changeID: string;
	revision: PatchsetDescription;
	baseRevision: PatchsetDescription | null;
}

export class FilesSubscriptionsManager<V> extends APISubSubscriptionManagerBase<
	V,
	ChangeSubscriptionsManagerConfig
> {
	protected override refetchIntervalOnNull = null;
	protected override _getMatches(
		config: WithMatchAny<ChangeSubscriptionsManagerConfig>
	): APISubscriptionManagerEntry<ChangeSubscriptionsManagerConfig, V>[] {
		const allEntries = this._subscriptions.entries();
		if (config === MATCH_ANY) {
			return allEntries.map((e) => e[1]);
		}
		return allEntries
			.filter(([c]) => {
				if (config.changeID === MATCH_ANY) {
					return true;
				}
				return c.changeID === config.changeID;
			})
			.filter(([c]) => {
				if (config.revision === MATCH_ANY) {
					return true;
				}
				return (
					config.revision.id === c.revision.id &&
					config.revision.number === c.revision.number
				);
			})
			.filter(([c]) => {
				if (config.baseRevision === MATCH_ANY) {
					return true;
				}
				if (!config.baseRevision && !c.baseRevision) {
					return true;
				}
				if (!config.baseRevision || !c.baseRevision) {
					return false;
				}
				return (
					config.baseRevision.id === c.baseRevision.id &&
					config.baseRevision.number === c.baseRevision.number
				);
			})
			.map((e) => e[1]);
	}
}
