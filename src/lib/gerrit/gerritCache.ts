import {
	createCacheWrapper,
	MultiLevelCacheContainer,
	ValueWithTimer,
} from '../util/cache';
import { GerritChange } from './gerritAPI/gerritChange';
import { CHANGE_CACHE_TIME } from '../util/constants';
import { GerritAPIWith } from './gerritAPI/api';

export class GerritChangeCache extends MultiLevelCacheContainer<
	string,
	GerritAPIWith[],
	GerritChange
> {
	private _withsSatisfyContraints(
		expected: GerritAPIWith[],
		actual: GerritAPIWith[]
	): boolean {
		for (const expectedValue of expected) {
			if (!actual.includes(expectedValue)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Finds any instance in the cache that has all withValues
	 * (including ones that have **more**)
	 */
	protected override getEntry(
		changeID: string,
		withValues: GerritAPIWith[]
	): ValueWithTimer<GerritChange> | null {
		const changeCache = this._cache.get(changeID);
		if (!changeCache) {
			return null;
		}

		for (const [withs, change] of changeCache.entries()) {
			if (this._withsSatisfyContraints(withValues, withs)) {
				return change;
			}
		}

		return null;
	}
}

export const getChangeCache = createCacheWrapper(
	() => new GerritChangeCache(CHANGE_CACHE_TIME)
);
