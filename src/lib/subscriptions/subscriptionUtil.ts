import { APISubSubscriptionManagerBase } from './baseSubscriptions';
import { callDeref } from '../util/garbageCollection';
import { Subscribable } from './subscriptions';

type InferSubscribeValues<S extends Subscribable<unknown>[]> = {
	[K in keyof S]: S[K] extends Subscribable<infer V> ? V : never;
} & {
	length: S['length'];
};

export function joinSubscribables<S extends Subscribable<unknown>[], R>(
	mapper: (...values: InferSubscribeValues<S>) => R,
	...subscribables: S
): Subscribable<R> {
	const unsubscribeAll = (): void =>
		subscribables.forEach((s) => s.unsubscribe());
	const weakUnsubscribe = new WeakRef(unsubscribeAll);
	const subscription: Omit<Subscribable<R>, 'mapSubscription'> = {
		getValue: async (forceUpdate) => {
			const values = await Promise.all(
				subscribables.map((sub) => sub.getValue(forceUpdate))
			);
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			return mapper(...values);
		},
		tryGetValue: async () => {
			const subscriptionValues = await Promise.all(
				subscribables.map((sub) => sub.tryGetValue())
			);

			const results = [];
			let lastGetAt = 0;
			for (const subscriptionValue of subscriptionValues) {
				if (!subscriptionValue.isSet) {
					return {
						isSet: false,
						value: null,
					};
				}
				results.push(subscriptionValue.value);
				lastGetAt = Math.max(lastGetAt, subscriptionValue.lastGetAt);
			}

			return {
				isSet: true,
				lastGetAt,
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				value: mapper(...results),
			};
		},
		disposable: {
			dispose: callDeref(weakUnsubscribe),
		},
		dispose: callDeref(weakUnsubscribe),
		invalidate: async () => {
			await Promise.all(subscribables.map((sub) => sub.invalidate()));
		},
		subscribe: (handler, options) => {
			const onChange = async (): Promise<void> => {
				const values = await Promise.all(
					subscribables.map((s) => s.getValue())
				);
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				handler.deref()?.(mapper(...values));
			};
			subscribables.forEach((sub) => {
				sub.subscribe(new WeakRef(onChange), options);
			});
		},
		subscribeOnce(handler, options) {
			this.subscribe(handler, {
				...options,
				once: true,
			});
		},
		unsubscribe: () => {
			unsubscribeAll();
		},
		fetchOnce: async () => {
			const values = await Promise.all(
				subscribables.map((sub) => sub.fetchOnce())
			);
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			return mapper(...values);
		},
	};
	return {
		...subscription,
		mapSubscription:
			APISubSubscriptionManagerBase.createMapper(subscription),
	};
}
