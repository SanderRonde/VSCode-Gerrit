export class VersionNumber {
	public constructor(
		private readonly _major: number,
		private readonly _minor: number,
		private readonly _patch: number | null
	) {}

	private static _sanitizeString(str: string): string {
		return str.trim().replace(/['"]/g, '');
	}

	public static from(str: string): VersionNumber {
		const [major, minor, patch] = this._sanitizeString(str).split('.');
		const parsedPatch = parseInt(patch, 10);
		return new this(
			parseInt(major, 10),
			parseInt(minor, 10),
			Number.isNaN(parsedPatch) ? null : parsedPatch
		);
	}

	private _operator(
		operator: '>' | '<' | '>=' | '<=',
		a: number,
		b: number
	): boolean {
		switch (operator) {
			case '>':
				return a > b;
			case '<':
				return a < b;
			case '>=':
				return a >= b;
			case '<=':
				return a <= b;
		}
	}

	private _isVersion(
		other: VersionNumber,
		operator: '>' | '<' | '>=' | '<=',
		onEqual: boolean
	): boolean {
		if (this._operator(operator, this._major, other._major)) {
			return true;
		}
		if (this._operator(operator, this._minor, other._minor)) {
			return true;
		}
		if (this._operator(operator, this._patch ?? 0, other._patch ?? 0)) {
			return true;
		}
		return onEqual;
	}

	public isGreaterThan(other: VersionNumber): boolean {
		return this._isVersion(other, '>', false);
	}

	public isGreaterThanOrEqual(other: VersionNumber): boolean {
		return this._isVersion(other, '>=', true);
	}

	public isSmallerThan(other: VersionNumber): boolean {
		return this._isVersion(other, '<', false);
	}

	public isSmallerThanOrEqual(other: VersionNumber): boolean {
		return this._isVersion(other, '<=', true);
	}

	public toString(): string {
		const parts = [this._major, this._minor, this._patch].filter(
			(v) => v !== null
		);
		return `v${parts.join('.')}`;
	}
}
