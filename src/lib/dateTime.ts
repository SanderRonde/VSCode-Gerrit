import { env } from 'vscode';

export enum DateSortDirection {
	INCREASING_TIME,
	DECREASING_TIME,
}

export class DateTime {
	private _date: Date;
	private _source: string | null = null;
	public get source(): string {
		return this._source ?? this._date.toISOString();
	}

	public constructor(date: Date);
	public constructor(dateString: string);
	public constructor(dateOrString: string | Date) {
		if (typeof dateOrString === 'string') {
			this._date = new Date(dateOrString);
			this._source = dateOrString;
		} else {
			this._date = dateOrString;
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
