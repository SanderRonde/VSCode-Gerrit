import { GerritChange } from './gerritChange';
import { runWith, Wither } from '../util';
import { GerritAPIWith } from './api';
import { getAPI } from '../gerritAPI';

let disableRecursionFlag = false;
const disableRecursionWither: Wither = {
	setup: () => (disableRecursionFlag = true),
	breakDown: () => (disableRecursionFlag = false),
};

export abstract class DynamicallyFetchable {
	protected abstract _id: string;

	protected _fieldFallbackGetter<K extends keyof this>(
		fieldName: K,
		flag: GerritAPIWith | GerritAPIWith[],
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

			const res = await api.getChange(
				this._id,
				...(Array.isArray(flag) ? flag : [flag])
			);
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
