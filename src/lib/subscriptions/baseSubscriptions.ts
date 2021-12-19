import {
	callDeref,
	IterableWeakMap,
	registerDisposer,
} from '../util/garbageCollection';
import { Subscribable } from './subscriptions';

enum FETCH_STATE {
	NOT_FETCHED,
	FETCHING,
	FETCHED,
}

export interface APISubscriptionManagerEntry<C, V> {
	getter: () => Promise<V>;
	listeners: IterableWeakMap<
		number,
		Set<{
			once: boolean;
			onInitial: boolean;
			listener: WeakRef<(value: V) => void>;
		}>
	>;
	value: Promise<V> | null;
	state: FETCH_STATE;
	config: C;
}

export const MATCH_ANY = Symbol('any');

export type WithMatchAny<C> =
	| typeof MATCH_ANY
	| {
			[K in keyof C]: C[K] | typeof MATCH_ANY;
	  };

export abstract class APISubSubscriptionManagerBase<V, C = string> {
	private _lastID: number = 0;
	protected _subscriptions: IterableWeakMap<
		C,
		APISubscriptionManagerEntry<C, V>
	> = new IterableWeakMap();

	public static createMapper<M>(
		originalSubscription: Omit<Subscribable<M>, 'mapSubscription'>
	): Subscribable<M>['mapSubscription'] {
		return <O>(mapper: (input: M) => O): Subscribable<O> => {
			const joinedSubscription: Omit<
				Subscribable<O>,
				'mapSubscription'
			> = {
				...originalSubscription,
				getValue: async (forceUpdate) => {
					return mapper(
						await originalSubscription.getValue(forceUpdate)
					);
				},
				subscribe: (handler, options) => {
					const mappedRef = new WeakRef((value: M): void =>
						handler.deref()?.(mapper(value))
					);
					return originalSubscription.subscribe(mappedRef, options);
				},
				subscribeOnce(handler, options) {
					this.subscribe(handler, {
						...options,
						once: true,
					});
				},
			};
			return {
				...joinedSubscription,
				mapSubscription: this.createMapper(joinedSubscription),
			};
		};
	}

	private _ensureConfigDefined(config: C, getter: () => Promise<V>): void {
		if (this._getMatches(config).length) {
			return;
		}
		this._subscriptions.set(config, {
			listeners: new IterableWeakMap(),
			value: null,
			state: FETCH_STATE.NOT_FETCHED,
			getter,
			config,
		});
	}

	private _ensureIdDefined(
		config: C,
		id: number,
		getter: () => Promise<V>
	): void {
		this._ensureConfigDefined(config, getter);
		const matches = this._getMatches(config);
		if (!matches.some((m) => m.listeners.has(id))) {
			matches[0].listeners.set(id, new Set());
		}
	}

	private async _performGetter(
		getter: () => Promise<V>,
		match: APISubscriptionManagerEntry<C, V>
	): Promise<V> {
		this._ensureConfigDefined(match.config, getter);

		const prevState = match.state;
		match.state = FETCH_STATE.FETCHING;
		match.value = getter();
		const resolved = await match.value;
		match.state = FETCH_STATE.FETCHED;
		match.value = Promise.resolve(resolved);

		match.listeners.values().forEach((listeners) => {
			listeners.forEach((listenerDescriber) => {
				if (
					prevState === FETCH_STATE.FETCHED ||
					listenerDescriber.onInitial
				) {
					listenerDescriber.listener.deref()?.(resolved);
					if (listenerDescriber.once) {
						listeners.delete(listenerDescriber);
					}
				}
			});
		});

		return resolved;
	}

	protected abstract _getMatches(
		config: WithMatchAny<C>
	): APISubscriptionManagerEntry<C, V>[];

	public createFetcher(config: C, getter: () => Promise<V>): Subscribable<V> {
		const id = this._lastID++;

		let unsubscribed = false;
		const unsubscribe = (): void => {
			if (unsubscribed) {
				return;
			}
			unsubscribed = true;

			const matches = this._getMatches(config);
			if (!matches.some((m) => m.listeners.has(id))) {
				return;
			}

			for (const match of matches) {
				if (match.listeners.has(id)) {
					match.listeners.delete(id);
					if (match.listeners.size === 0) {
						this._subscriptions.delete(match.config);
					}
				}
			}
		};
		const weakUnsubscribe = new WeakRef(unsubscribe);

		const subscription: Omit<Subscribable<V>, 'mapSubscription'> = {
			subscribe: (
				handler,
				{
					onInitial = false,
					once = false,
				}: { once?: boolean; onInitial?: boolean } = {}
			) => {
				if (unsubscribed) {
					console.warn('Resubscribing while alread unsubscribed!');
				}
				this._ensureIdDefined(config, id, getter);

				const match = this._getMatches(config).find((m) =>
					m.listeners.has(id)
				)!;
				match.listeners.get(id)!.add({
					listener: handler,
					once,
					onInitial,
				});
			},
			subscribeOnce(handler, options) {
				this.subscribe(handler, {
					...options,
					once: true,
				});
			},
			getValue: async (forceUpdate) => {
				this._ensureConfigDefined(config, getter);
				const matches = this._getMatches(config);
				if (!forceUpdate) {
					for (const match of matches) {
						if (match.state === FETCH_STATE.FETCHED) {
							return match.value!;
						}
					}
					for (const match of matches) {
						if (match.state === FETCH_STATE.FETCHING) {
							return match.value!;
						}
					}
				}
				return this._performGetter(getter, matches[0]);
			},
			unsubscribe: () => {
				unsubscribe();
			},
			invalidate: async () => {
				await this.invalidate(config);
			},
			disposable: {
				dispose: callDeref(weakUnsubscribe),
			},
			dispose: callDeref(weakUnsubscribe),
		};
		registerDisposer(
			subscription,
			[
				{
					dispose: callDeref(weakUnsubscribe),
				},
			],
			'subscription'
		);
		return {
			...subscription,
			mapSubscription:
				APISubSubscriptionManagerBase.createMapper<V>(subscription),
		};
	}

	public async invalidate(config: WithMatchAny<C>): Promise<void> {
		const matches = this._getMatches(config);
		await Promise.all(
			matches.map(async (match) => {
				match.state = FETCH_STATE.NOT_FETCHED;
				await this._performGetter(match.getter, match);
			})
		);
	}
}
