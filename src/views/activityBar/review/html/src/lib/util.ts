export function fromEntries<K, V>(entries: [K, V][]): { [key: string]: V } {
	return entries.reduce((obj, [key, val]) => {
		(
			obj as {
				[key: string]: unknown;
			}
		)[key as unknown as string] = val;
		return obj;
	}, {});
}
