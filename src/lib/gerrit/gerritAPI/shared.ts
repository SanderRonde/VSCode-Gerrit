import { runWith, uniqueSimple, Wither } from '../../util/util';
import { GerritChange } from './gerritChange';
import { GerritAPIWith } from './api';
import { getAPI } from '../gerritAPI';

let disableRecursionFlag = false;
const disableRecursionWither: Wither = {
	setup: () => (disableRecursionFlag = true),
	breakDown: () => (disableRecursionFlag = false),
};

export abstract class DynamicallyFetchable {
	public abstract get changeID(): string;

	protected _fieldFallbackGetter<K extends keyof this>(
		fieldName: K,
		flags: GerritAPIWith[],
		getRemoteValue: (remote: GerritChange) => Promise<this[K]>,
		extraCallback?: (remote: GerritChange) => Promise<unknown>
	): Promise<this[K] | null> {
		return (async () => {
			if (this[fieldName]) {
				return this[fieldName];
			}

			if (disableRecursionFlag) {
				return null;
			}

			const api = await getAPI();
			if (!api) {
				return null;
			}

			const res = await GerritChange.getChangeOnce(
				this.changeID,
				uniqueSimple(flags)
			);
			if (!res) {
				return null;
			}

			await runWith(disableRecursionWither, async () => {
				this[fieldName] = await getRemoteValue(res);
				if (extraCallback) {
					await extraCallback(res);
				}
			});
			return this[fieldName];
		})();
	}
}
