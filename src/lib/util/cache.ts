import { Disposable } from 'vscode';

export function createInittableValue<V>(): {
	get: () => Promise<V>;
	init: (value: V) => void;
	setValue: (value: V) => void;
} {
	let valueSet: boolean = false;
	let value: V | null = null;
	let resolveValuePromise: (() => void) | null = null;
	const valuePromise: Promise<void> = new Promise<void>((resolve) => {
		resolveValuePromise = resolve;
	});

	return {
		init(newValue: V) {
			value = newValue;
			if (!valueSet) {
				valueSet = true;
				resolveValuePromise?.();
			}
		},
		setValue(newValue: V) {
			this.init(newValue);
		},
		async get() {
			if (valueSet) {
				return value as V;
			}
			await valuePromise;
			return value as V;
		},
	};
}

export function createCacheWrapper<V, A>(
	getter: (...args: A[]) => Promise<V>
): (...args: A[]) => Promise<V>;
export function createCacheWrapper<V, A>(
	getter: (...args: A[]) => V
): (...args: A[]) => V;
export function createCacheWrapper<V, A>(
	getter: (...args: A[]) => Promise<V> | V
): (...args: A[]) => Promise<V> | V {
	let hasValue: boolean = false;
	let value: V | null = null;

	return (...args: A[]) => {
		if (!hasValue) {
			const getterResult = getter(...args);
			if ('then' in getterResult) {
				return new Promise((resolve) => {
					void getterResult.then((newValue) => {
						value = newValue;
						hasValue = true;
						resolve(newValue);
					});
				});
			} else {
				hasValue = true;
				value = getterResult;
			}
		}

		return value!;
	};
}

const cacheMap: Map<
	string,
	{
		hasValue: boolean;
		value: unknown;
		fn: (...args: unknown[]) => unknown;
	}
> = new Map();
export function createCacheSetter<V, A>(
	id: string,
	getter: (...args: A[]) => Promise<V>
): (...args: A[]) => Promise<V>;
export function createCacheSetter<V, A>(
	id: string,
	getter: (...args: A[]) => V
): (...args: A[]) => V;
export function createCacheSetter<V, A>(
	id: string,
	getter: (...args: A[]) => Promise<V> | V
): (...args: A[]) => Promise<V> | V {
	const returnFn = (...args: A[]): V | Promise<V> => {
		const getterResult = getter(...args);
		if ('then' in getterResult) {
			void getterResult.then((newValue) => {
				cacheMap.set(id, {
					hasValue: true,
					value: newValue,
					fn: returnFn as (...args: unknown[]) => unknown,
				});
			});
		} else {
			cacheMap.set(id, {
				hasValue: true,
				value: getterResult,
				fn: returnFn as (...args: unknown[]) => unknown,
			});
		}

		return getterResult;
	};

	if (!cacheMap.has(id)) {
		cacheMap.set(id, {
			hasValue: false,
			value: null,
			fn: returnFn as (...args: unknown[]) => unknown,
		});
	}

	return returnFn;
}

export function createCacheGetter<V, A extends unknown[]>(
	id: string
): (...args: A) => Promise<V>;
export function createCacheGetter<V, A extends unknown[]>(
	id: string
): (...args: A) => V;
export function createCacheGetter<V, A extends unknown[]>(
	id: string
): (...args: A) => Promise<V> | V {
	return async (...args: A) => {
		const cached = cacheMap.get(id)!;
		if (cached.hasValue) {
			return cached.value as V | Promise<V>;
		}

		return cached.fn(...args) as V | Promise<V>;
	};
}

export class CacheContainer<K, V, KK = K> implements Disposable {
	private _cache: Map<KK, ValueWithTimer<V>> = new Map();

	public constructor(private readonly _refreshTimer?: number | null) {}

	protected getEntry(k1: K): ValueWithTimer<V> | null {
		const key = this.getKey(k1);
		if (!this._cache.has(key)) {
			return null;
		}
		return this._cache.get(key)!;
	}

	protected getKey(k1: K): KK {
		return k1 as unknown as KK;
	}

	public set(k1: K, value: V): void {
		const prevValue = this.getEntry(k1);
		if (prevValue?.clearTimer) {
			prevValue.clearTimer();
		}

		const key = this.getKey(k1);
		const timeout =
			this._refreshTimer &&
			setTimeout(() => {
				this._cache.delete(key);
			}, this._refreshTimer);
		this._cache.set(key, {
			value,
			clearTimer: timeout
				? () => {
						clearTimeout(timeout);
				  }
				: undefined,
		});
	}

	public has(k1: K): boolean {
		return !!this.getEntry(k1);
	}

	public get(k1: K): V | null {
		return this.getEntry(k1)?.value ?? null;
	}

	public delete(k1: K): void {
		const key = this.getKey(k1);
		this._cache.delete(key);
	}

	public dispose(): void {
		[...this._cache.values()].forEach((entry) => {
			entry.clearTimer?.();
		});
		this._cache.clear();
	}
}

export type ValueWithTimer<V> = {
	value: V;
	clearTimer?: () => void;
};

export class MultiLevelCacheContainer<K1, K2, V> implements Disposable {
	protected _cache: Map<K1, Map<K2, ValueWithTimer<V>>> = new Map();

	public constructor(private readonly _refreshTimer?: number | null) {}

	protected getEntry(k1: K1, k2: K2): ValueWithTimer<V> | null {
		if (!this._cache.has(k1)) {
			return null;
		}
		const l1 = this._cache.get(k1)!;
		if (!l1.has(k2)) {
			return null;
		}
		return l1.get(k2)!;
	}

	public set(k1: K1, k2: K2, value: V): void {
		if (!this._cache.has(k1)) {
			this._cache.set(k1, new Map());
		}
		const prevValue = this.getEntry(k1, k2);
		if (prevValue?.clearTimer) {
			prevValue.clearTimer();
		}

		const timeout =
			this._refreshTimer &&
			setTimeout(() => {
				this._cache.get(k1)!.delete(k2);
			}, this._refreshTimer);
		this._cache.get(k1)!.set(k2, {
			value,
			clearTimer: timeout
				? () => {
						clearTimeout(timeout);
				  }
				: undefined,
		});
	}

	public has(k1: K1, k2: K2): boolean {
		return !!this.getEntry(k1, k2);
	}

	public get(k1: K1, k2: K2): V | null {
		return this.getEntry(k1, k2)?.value ?? null;
	}

	public dispose(): void {
		[...this._cache.values()].forEach((l1) => {
			[...l1.values()].forEach((l2) => {
				l2.clearTimer?.();
			});
			l1.clear();
		});
		this._cache.clear();
	}
}
