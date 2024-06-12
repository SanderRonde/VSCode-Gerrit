/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { registerDisposer } from './garbageCollection';
import { Disposable } from 'vscode';

export class SelfDisposable {
	protected readonly _disposables: Disposable[] = [];

	public constructor(description?: string) {
		registerDisposer(this, this._disposables, description);
	}
}

export const selfDisposableMixin = <
	B extends abstract new (...args: any[]) => any,
>(
	base: B
) => {
	abstract class _ extends base {
		protected readonly _disposables: Disposable[] = [];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		public constructor(...args: any[]) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			super(...args);
			registerDisposer(this, this._disposables);
		}
	}
	return _;
};
