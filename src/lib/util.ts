/**
 * Creates an interval that waits for the action
 * to complete before setting a new timer
 */
export function createAwaitingInterval(
	action: () => Promise<void>,
	interval: number
): {
	dispose: () => void;
} {
	let timer: NodeJS.Timeout | undefined;

	const setTimer = (): void => {
		timer = setTimeout(() => {
			void action().then(setTimer);
		}, interval);
	};

	setTimer();

	return {
		dispose: () => {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
		},
	};
}

export interface Wither {
	setup: () => void;
	breakDown: () => void;
}

export async function runWith<R>(
	wither: Wither,
	fn: () => Promise<R> | R
): Promise<R> {
	wither.setup();
	const value = await fn();
	wither.breakDown();
	return value;
}

export function uniqueSimple<T>(arr: T[]): T[] {
	return [...new Set(arr)];
}

export function uniqueComplex<T>(arr: T[], key: (item: T) => string): T[] {
	const items: T[] = [];
	for (const item of arr) {
		const keyValue = key(item);
		const alreadyPushed = items.find((i) => key(i) === keyValue);
		if (!alreadyPushed) {
			items.push(item);
		}
	}
	return items;
}

export function decodeBase64(text: string): string {
	return Buffer.from(text, 'base64').toString('utf8');
}

/**
 * Equal to
 * ```ts
 * condition ? ifTrue ?? fallback : fallback
 * ```
 */
export function tertiaryWithFallback<V>(
	condition: boolean,
	ifTrue: V | null,
	fallback: V
): V {
	if (!condition) {
		return fallback;
	}
	return ifTrue ?? fallback;
}
