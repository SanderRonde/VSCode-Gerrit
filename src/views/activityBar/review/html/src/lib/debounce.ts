import * as React from 'react';

const dataMap: WeakMap<
	Record<string, unknown>,
	{
		timer: number | null;
	}
> = new WeakMap();

export function useDebounce(
	interval: number
): <F extends (...args: unknown[]) => unknown>(
	fn: F,
	...args: Parameters<F>[]
) => void {
	const data = React.useMemo(() => ({}), []);

	React.useEffect(() => {
		dataMap.set(data, {
			timer: null,
		});
	}, [data]);

	return <F extends (...args: unknown[]) => unknown>(
		fn: F,
		...args: Parameters<F>[]
	) => {
		const mapped = dataMap.get(data)!;

		if (mapped.timer) {
			window.clearTimeout(mapped.timer);
		}

		mapped.timer = window.setTimeout(() => {
			mapped.timer = null;

			fn(...args);
		}, interval);
	};
}
