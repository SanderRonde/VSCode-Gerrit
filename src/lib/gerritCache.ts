import { GerritChange } from './gerritAPI/gerritChange';
import { GerritAPIWith } from './gerritAPI/api';

export class GerritChangeCache {
	private _cache: Map<string, Map<string, GerritChange>> = new Map();

	private _withValuesToString(withValues: GerritAPIWith[]) {
		return withValues.sort().join('.');
	}

	set(changeId: string, withValues: GerritAPIWith[], change: GerritChange) {
		if (!this._cache.has(changeId)) {
			this._cache.set(changeId, new Map());
		}
		this._cache
			.get(changeId)!
			.set(this._withValuesToString(withValues), change);
	}

	has(changeId: string, withValues: GerritAPIWith[]): boolean {
		return (
			this._cache.has(changeId) &&
			this._cache.get(changeId)!.has(this._withValuesToString(withValues))
		);
	}

	get(changeId: string, withValues: GerritAPIWith[]) {
		if (!this._cache.has(changeId)) {
			return null;
		}
		return this._cache
			.get(changeId)!
			.get(this._withValuesToString(withValues));
	}
}

let changeCache: GerritChangeCache | null = null;
export function getChangeCache(): GerritChangeCache {
	if (changeCache) {
		return changeCache;
	}

	return (changeCache = new GerritChangeCache());
}
