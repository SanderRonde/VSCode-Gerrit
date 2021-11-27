import { runWith, uniqueSimple, Wither } from '../util';
import { GerritChange } from './gerritChange';
import { GerritAPIWith } from './api';
import { getAPI } from '../gerritAPI';

let disableRecursionFlag = false;
const disableRecursionWither: Wither = {
	setup: () => (disableRecursionFlag = true),
	breakDown: () => (disableRecursionFlag = false),
};

export abstract class DynamicallyFetchable {
	protected abstract _patchID: string;

	protected _fieldFallbackGetter<K extends keyof this>(
		fieldName: K,
		flags: GerritAPIWith[],
		getRemoteValue: (remote: GerritChange) => Promise<any>,
		extraCallback?: (remote: GerritChange) => Promise<any>
	): Promise<this[K] | null> {
		return (async () => {
			if (this[fieldName]) {
				return this[fieldName];
			}

			if (disableRecursionFlag) {
				return null;
			}

			const api = getAPI();
			if (!api) {
				return null;
			}

			const res = await api.getChange(this._patchID, ...uniqueSimple(flags));
			if (!res) {
				return null;
			}

			await runWith(disableRecursionWither, async () => {
				(this as any)[fieldName] = await getRemoteValue(res);
				if (extraCallback) {
					await extraCallback(res);
				}
			});
			return this[fieldName];
		})();
	}
}
