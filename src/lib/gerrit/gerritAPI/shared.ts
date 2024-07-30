import { runWith, uniqueSimple, Wither } from '../../util/util';
import { GerritChange } from './gerritChange';
import { getAPIForRepo } from '../gerritAPI';
import { GerritRepo } from '../gerritRepo';
import { Data } from '../../util/data';
import { GerritAPIWith } from './api';

let disableRecursionFlag = false;
const disableRecursionWither: Wither = {
	setup: () => (disableRecursionFlag = true),
	breakDown: () => (disableRecursionFlag = false),
};

export abstract class DynamicallyFetchable {
	public abstract get changeID(): string;
	public abstract get gerritRepo(): GerritRepo;
	public abstract get gerritReposD(): Data<GerritRepo[]>;

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

			const api = await getAPIForRepo(this.gerritReposD, this.gerritRepo);
			if (!api) {
				return null;
			}

			const res = await api
				.getChange(this.changeID, null, uniqueSimple(flags))
				.getValue();
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
