import { env } from 'vscode';

export enum DateSortDirection {
	INCREASING_TIME,
	DECREASING_TIME,
}

export class DateTime {
	private readonly _date: Date;
	private _stringSource: string | null = null;
	public get source(): string {
		return this._stringSource ?? this._date.toISOString();
	}

	public constructor(date: Date);
	public constructor(date: string);
	public constructor(date: number);
	public constructor(date: string | number | Date) {
		if (typeof date === 'string' || typeof date === 'number') {
			this._date = new Date(date);
			if (typeof date === 'string') {
				this._stringSource = date;
			}
		} else {
			this._date = date;
		}
	}

	public static sortByDate<V>(
		array: V[],
		direction: DateSortDirection,
		getDate: (value: V) => DateTime
	): V[] {
		return array.sort((a, b) => {
			const dateA = getDate(a);
			const dateB = getDate(b);
			if (direction === DateSortDirection.INCREASING_TIME) {
				return dateA.timestamp() - dateB.timestamp();
			} else {
				return dateB.timestamp() - dateA.timestamp();
			}
		});
	}

	public format(options: Intl.DateTimeFormatOptions): string {
		return Intl.DateTimeFormat(env.language, options).format(this._date);
	}

	public formatRelative(options?: Intl.RelativeTimeFormatOptions): string {
		const formatter = new Intl.RelativeTimeFormat(env.language, options);
		const timeDiff = this._date.getTime() - new Date().getTime();
		const absTimeDiff = Math.abs(timeDiff);
		if (absTimeDiff <= 1000 * 60) {
			return formatter.format(Math.round(timeDiff / 1000), 'second');
		}
		if (absTimeDiff <= 1000 * 60 * 60) {
			return formatter.format(
				Math.round(timeDiff / (1000 * 60)),
				'minute'
			);
		}
		if (absTimeDiff <= 1000 * 60 * 60 * 24) {
			return formatter.format(
				Math.round(timeDiff / (1000 * 60 * 60)),
				'hour'
			);
		}
		if (absTimeDiff <= 1000 * 60 * 60 * 24 * 30) {
			return formatter.format(
				Math.round(timeDiff / (1000 * 60 * 60 * 24)),
				'day'
			);
		}
		if (absTimeDiff <= 1000 * 60 * 60 * 24 * 30 * 12) {
			return formatter.format(
				Math.round(timeDiff / (1000 * 60 * 60 * 24 * 30)),
				'month'
			);
		}
		return formatter.format(
			timeDiff / (1000 * 60 * 60 * 24 * 30 * 12),
			'year'
		);
	}

	public formatToParts(
		options: Intl.DateTimeFormatOptions
	): Intl.DateTimeFormatPart[] {
		return Intl.DateTimeFormat(env.language, options).formatToParts(
			this._date
		);
	}

	public timestamp(): number {
		return this._date.getTime();
	}
}
