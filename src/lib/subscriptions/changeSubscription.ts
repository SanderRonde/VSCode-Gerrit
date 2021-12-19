import {
	APISubscriptionManagerEntry,
	APISubSubscriptionManagerBase,
	MATCH_ANY,
	WithMatchAny,
} from './baseSubscriptions';
import { GerritAPIWith } from '../gerrit/gerritAPI/api';

export enum ChangeField {
	FILES = 'files',
}

interface ChangeSubscriptionsManagerConfig {
	changeID: string;
	withValues: GerritAPIWith[];
	field: ChangeField | null;
}

export class GenericChangeSubscriptionsManager<
	T
> extends APISubSubscriptionManagerBase<T, ChangeSubscriptionsManagerConfig> {
	protected override _getMatches(
		config: WithMatchAny<ChangeSubscriptionsManagerConfig>
	): APISubscriptionManagerEntry<ChangeSubscriptionsManagerConfig, T>[] {
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
				if (config.withValues === MATCH_ANY) {
					return true;
				}
				for (const requiredWith of config.withValues) {
					if (!c.withValues.includes(requiredWith)) {
						return false;
					}
				}
				return true;
			})
			.map((e) => e[1]);
	}
}
