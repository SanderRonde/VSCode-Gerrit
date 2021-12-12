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
