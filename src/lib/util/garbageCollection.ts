import { shouldDebugGarbageCollection } from './dev';
import { Disposable } from 'vscode';
import { logDev } from './log';

const listeners: Set<FinalizationRegistry<unknown>> = new Set();
const disposeRegistry = new FinalizationRegistry<{
	disposables: Disposable[];
	description?: string;
}>(({ disposables, description }) => {
	if (shouldDebugGarbageCollection()) {
		logDev('disposing', description);
	}
	disposables.forEach((d) => void d.dispose());
});

export function registerFinalizationListener(
	value: object,
	callback: () => void
): void;
export function registerFinalizationListener<A>(
	value: object,
	callback: (args: A) => void,
	args: A
): void;
export function registerFinalizationListener<A>(
	value: object,
	callback: (args?: A) => void,
	args?: A
): void {
	const registry = new FinalizationRegistry<A>(callback);
	listeners.add(registry);
	registry.register(value, args!);
}

export function registerDisposer(
	value: object,
	disposables: Disposable[],
	description?: string
): void {
	disposeRegistry.register(value, {
		disposables,
		description,
	});
}

function weakLogger(set: WeakSet<object>, description: string): void {
	setInterval(() => {
		logDev(set, description);
	}, 1000 * 10);
}

export function createWeakLogger(value: object, description: string): void {
	const set = new WeakSet();
	set.add(value);
	weakLogger(set, description);
}

export class IterableWeakMap<K, V> {
	private static readonly _registry = new FinalizationRegistry<{
		map: Map<unknown, unknown>;
		key: unknown;
	}>(({ map, key }) => {
		map.delete(key);
	});
	private readonly _map: Map<
		K,
		V extends object
			? {
					isWeak: true;
					value: WeakRef<V>;
			  }
			: {
					isWeak: false;
					wrapper: WeakRef<{ value: V }>;
			  }
	> = new Map();

	public get size(): number {
		return this.entries().length;
	}

	public set(key: K, value: V): void {
		const isWeak = typeof value === 'object' && value;
		const weak = isWeak
			? new WeakRef(value as unknown as object)
			: new WeakRef({ value });

		IterableWeakMap._registry.register(weak, {
			key,
			map: this._map,
		});

		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		this._map.set(key, {
			isWeak,
			value: weak,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
	}

	public get(key: K): V | undefined {
		const value = this._map.get(key);
		if (value) {
			if (value.isWeak) {
				return value.value.deref();
			} else {
				return value.wrapper.deref()?.value;
			}
		}
		return undefined;
	}

	public has(key: K): boolean {
		if (!this._map.has(key)) {
			return false;
		}
		const value = this._map.get(key)!;
		if (value.isWeak) {
			return value.value.deref() !== undefined;
		} else {
			return value.wrapper.deref()?.value !== undefined;
		}
	}

	public delete(key: K): boolean {
		return this._map.delete(key);
	}

	public entries(): [K, V][] {
		return [...this._map.entries()]
			.map(([key, value]) => {
				if (value.isWeak) {
					return [key, value.value.deref()];
				} else {
					return [key, value.wrapper.deref()?.value];
				}
			})
			.filter((entry): entry is [K, V] => entry[1] !== undefined);
	}

	public values(): V[] {
		return [...this._map.values()]
			.map((value) => {
				if (value.isWeak) {
					return value.value.deref();
				} else {
					return value.wrapper.deref()?.value;
				}
			})
			.filter((entry): entry is V => entry !== undefined);
	}
}

export function callDeref<V extends (...args: unknown[]) => unknown>(
	value: WeakRef<V>
): () => void {
	return () => value.deref()?.();
}

export function createWeakWrapperDisposer<V extends Disposable>(
	ref: WeakRef<{ value?: V | null }>
): Disposable {
	return {
		dispose() {
			ref.deref()?.value?.dispose();
		},
	};
}
