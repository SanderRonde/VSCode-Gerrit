import { env } from 'vscode';

export enum DateSortDirection {
	INCREASING_TIME,
	DECREASING_TIME,
}

export class DateTime {
	private _date: Date;

	constructor(date: Date);
	constructor(dateString: string);
	constructor(dateOrString: string | Date) {
		if (typeof dateOrString === 'string') {
			this._date = new Date(dateOrString);
		} else {
			this._date = dateOrString;
		}
	}

	static sortByDate<V>(
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

	format(options: Intl.DateTimeFormatOptions) {
		return Intl.DateTimeFormat(env.language, options).format(this._date);
	}

	formatToParts(options: Intl.DateTimeFormatOptions) {
		return Intl.DateTimeFormat(env.language, options).formatToParts(
			this._date
		);
	}

	timestamp() {
		return this._date.getTime();
	}
}
