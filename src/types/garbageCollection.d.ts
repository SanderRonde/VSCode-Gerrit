declare global {
	declare class FinalizationRegistry<V = void> {
		public constructor(callback: (values: V) => void);
		public register(obj: object, holdings: V): void;
		public unregister(obj: object): void;
	}

	declare class WeakRef<V extends object> {
		public constructor(value: V);
		public deref(): V | undefined;
	}
}

export {};
