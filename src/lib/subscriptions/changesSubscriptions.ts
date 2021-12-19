import {
	APISubscriptionManagerEntry,
	APISubSubscriptionManagerBase,
	MATCH_ANY,
	WithMatchAny,
} from './baseSubscriptions';
import {
	DefaultChangeFilter,
	GerritChangeFilter,
} from '../gerrit/gerritAPI/filters';
import { ChangesOffsetParams, GerritAPIWith } from '../gerrit/gerritAPI/api';
import { GerritChange } from '../gerrit/gerritAPI/gerritChange';

interface ChangesSubscriptionsManagerConfig {
	filters: (DefaultChangeFilter | GerritChangeFilter)[][];
	offsetParams: ChangesOffsetParams | undefined;
	withValues: GerritAPIWith[];
	query: string;
}

export class ChangesSubscriptionsManager extends APISubSubscriptionManagerBase<
	GerritChange[],
	ChangesSubscriptionsManagerConfig
> {
	private _sortFilters(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][]
	): (DefaultChangeFilter | GerritChangeFilter)[][] {
		return filters.map((filterSet) => filterSet.sort()).sort();
	}

	protected override _getMatches(
		config: WithMatchAny<ChangesSubscriptionsManagerConfig>
	): APISubscriptionManagerEntry<
		ChangesSubscriptionsManagerConfig,
		GerritChange[]
	>[] {
		const allEntries = this._subscriptions.entries();
		if (config === MATCH_ANY) {
			return allEntries.map((e) => e[1]);
		}
		return allEntries
			.filter(([c]) => {
				if (config.filters === MATCH_ANY) {
					return true;
				}
				return (
					c.filters.length === config.filters.length &&
					JSON.stringify(this._sortFilters(c.filters)) ===
						JSON.stringify(this._sortFilters(config.filters))
				);
			})
			.filter(([c]) => {
				if (config.offsetParams === MATCH_ANY) {
					return true;
				}
				return (
					c.offsetParams?.count === config.offsetParams?.count &&
					(c.offsetParams?.offset || 0) ===
						config.offsetParams?.offset
				);
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
			.filter(([c]) => {
				if (config.query === MATCH_ANY) {
					return true;
				}
				return c.query === config.query;
			})
			.map((e) => e[1]);
	}
}
