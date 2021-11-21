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

	const setTimer = () => {
		timer = setTimeout(async () => {
			await action();
			setTimer();
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

export async function runWith<R>(wither: Wither, fn: () => Promise<R> | R) {
	wither.setup();
	let value = await fn();
	wither.breakDown();
	return value;
}
