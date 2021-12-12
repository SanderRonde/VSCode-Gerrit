import { GerritChange } from './gerritAPI/gerritChange';
import { CHANGE_CACHE_TIME } from '../util/constants';
import { GerritAPIWith } from './gerritAPI/api';
import { Disposable } from 'vscode';

export class GerritChangeCache implements Disposable {
	private _cache: Map<
		string,
		Map<
			GerritAPIWith[],
			{
				change: GerritChange;
				clearTimer: () => void;
			}
		>
	> = new Map();

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
				return change.change;
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
		const prevValue = this._cache.get(changeID)!.get(withValues);
		if (prevValue?.clearTimer) {
			prevValue.clearTimer();
		}

		const timeout = setTimeout(() => {
			this._cache.get(changeID)!.delete(withValues);
		}, CHANGE_CACHE_TIME);
		this._cache.get(changeID)!.set(withValues, {
			change,
			clearTimer: () => {
				clearTimeout(timeout);
			},
		});
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

	public dispose(): void {
		[...this._cache.values()].forEach((changeCache) => {
			[...changeCache.values()].forEach((change) => {
				change.clearTimer();
			});
		});
		this._cache.clear();
	}
}

let changeCache: GerritChangeCache | null = null;
export function getChangeCache(): GerritChangeCache {
	if (changeCache) {
		return changeCache;
	}

	return (changeCache = new GerritChangeCache());
}
