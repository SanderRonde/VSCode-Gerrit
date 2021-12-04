import { Disposable } from 'vscode';

export class OnceDisposable implements Disposable {
	protected _disposed: boolean = false;

	public dispose(): boolean | void {
		if (!this._disposed) {
			this._disposed = true;
			return true;
		}
		return false;
	}
}
