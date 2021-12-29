import {
	APISubscriptionManagerEntry,
	APISubSubscriptionManagerBase,
	MATCH_ANY,
	WithMatchAny,
} from './baseSubscriptions';
import { QuickCheckoutApplyInfo } from '../git/quick-checkout';

export class QuickCheckoutSubscriptionsManager extends APISubSubscriptionManagerBase<
	QuickCheckoutApplyInfo[],
	Record<string, unknown>
> {
	protected override _getMatches(
		config: WithMatchAny<Record<string, unknown>>
	): APISubscriptionManagerEntry<
		Record<string, unknown>,
		QuickCheckoutApplyInfo[]
	>[] {
		const allEntries = this._subscriptions.entries();
		if (config === MATCH_ANY) {
			return allEntries.map((e) => e[1]);
		}
		return allEntries.map((e) => e[1]);
	}
}
