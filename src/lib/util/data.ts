import { Disposable } from 'vscode';

export class Data<T> {
	private _subscribers: Set<(value: T) => void | Promise<void>> = new Set();

	public constructor(private _value: T) {}

	public subscribe(
		callback: (value: T) => void | Promise<void>,
		callInitial: boolean = true
	): Disposable {
		this._subscribers.add(callback);
		if (callInitial) {
			void callback(this._value);
		}
		return {
			dispose: () => this.unsubscribe(callback),
		};
	}

	public unsubscribe(callback: (value: T) => void | Promise<void>): void {
		this._subscribers.delete(callback);
	}

	public waitFor(predicate: (value: T) => boolean): Promise<T> {
		return new Promise((resolve) => {
			const callback = (value: T): void => {
				if (predicate(value)) {
					this.unsubscribe(callback);
					resolve(value);
				}
			};
			this.subscribe(callback);
		});
	}

	public set(value: T): void {
		this._value = value;
		this._subscribers.forEach((subscriber) => void subscriber(value));
	}

	public update(updater: (value: T) => T): void {
		this.set(updater(this._value));
	}

	public get(): T {
		return this._value;
	}
}
