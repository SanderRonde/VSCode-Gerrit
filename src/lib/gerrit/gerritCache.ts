import { GerritChange } from './gerritAPI/gerritChange';
import { GerritAPIWith } from './gerritAPI/api';

export class GerritChangeCache {
	private _cache: Map<string, Map<GerritAPIWith[], GerritChange>> = new Map();

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
	private _findMatchingWith(
		changeID: string,
		withValues: GerritAPIWith[]
	): GerritChange | null {
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

	public set(
		changeID: string,
		withValues: GerritAPIWith[],
		change: GerritChange
	): void {
		if (!this._cache.has(changeID)) {
			this._cache.set(changeID, new Map());
		}
		this._cache.get(changeID)!.set(withValues, change);
	}

	public has(changeID: string, withValues: GerritAPIWith[]): boolean {
		return !!this._findMatchingWith(changeID, withValues);
	}

	public get(
		changeID: string,
		withValues: GerritAPIWith[]
	): GerritChange | null {
		return this._findMatchingWith(changeID, withValues);
	}
}

let changeCache: GerritChangeCache | null = null;
export function getChangeCache(): GerritChangeCache {
	if (changeCache) {
		return changeCache;
	}

	return (changeCache = new GerritChangeCache());
}
