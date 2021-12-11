export class TemporaryCache<K, V> {
	private _cache: Map<
		K,
		{
			timeout: NodeJS.Timeout;
			value: V;
		}
	> = new Map();

	public constructor(private readonly ttl: number) {}

	public get(key: K): V | undefined {
		return this._cache.get(key)?.value;
	}

	public has(key: K): boolean {
		return this._cache.has(key);
	}

	public set(key: K, value: V): void {
		const prevValue = this._cache.get(key);
		if (prevValue) {
			clearTimeout(prevValue.timeout);
		}
		this._cache.set(key, {
			value,
			timeout: setTimeout(() => this._cache.delete(key), this.ttl),
		});
	}

	public delete(key: K): void {
		this._cache.delete(key);
	}
}
