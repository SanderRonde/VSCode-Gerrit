import got, { OptionsOfTextResponseBody, Response } from 'got/dist/source';
import { DefaultChangeFilter, GerritChangeFilter } from './filters';
import { GerritChangeResponse } from '../../types/gerritAPI';
import { getChangeCache } from '../gerritCache';
import { GerritChange } from './gerritChange';
import { URLSearchParams } from 'url';
import { window } from 'vscode';

export enum GerritAPIWith {
	LABELS = 'LABELS',
	DETAILED_LABELS = 'DETAILED_LABELS',
	DETAILED_ACCOUNTS = 'DETAILED_ACCOUNTS',
	CURRENT_REVISION = 'CURRENT_REVISION',
	CURRENT_FILES = 'CURRENT_FILES',
}

type WithValue<
	GC extends typeof GerritChange,
	V extends keyof InstanceType<GC>
> = {
	new (...args: ConstructorParameters<GC>): Omit<InstanceType<GC>, V> & {
		[K in V]: InstanceType<GC>[V] extends Promise<infer P>
			? Promise<Exclude<P, null | undefined>>
			: Exclude<InstanceType<GC>[V], null | undefined>;
	};
};

export class GerritAPI {
	private readonly _MAGIC_PREFIX = ")]}'";

	constructor(
		private _url: string,
		private _username: string,
		private _password: string
	) {}

	private get _headers() {
		return {
			Authorization:
				'Basic ' +
				Buffer.from(`${this._username}:${this._password}`).toString(
					'base64'
				),
			ContentType: 'application/json',
		};
	}

	private get _get(): OptionsOfTextResponseBody {
		return {
			method: 'GET',
			headers: this._headers,
		};
	}

	private _getURL(path: string) {
		return `${this._url}/a/${path}`;
	}

	private _stripMagicPrefix(body: string) {
		if (!body.startsWith(this._MAGIC_PREFIX)) {
			return body.trim();
		}
		return body.slice(this._MAGIC_PREFIX.length).trim();
	}

	private async _tryRequest(
		url: string,
		body?: OptionsOfTextResponseBody
	): Promise<(Response<string> & { strippedBody: string }) | null> {
		try {
			const response = (await got(url, body)) as any;
			response.strippedBody = this._stripMagicPrefix(response.body);
			return response;
		} catch (e) {
			window.showErrorMessage(
				`Gerrit request to "${url}" failed. Please check your settings and/or connection`
			);
			return null;
		}
	}

	private _tryParseJSON<J>(text: string): J | null {
		try {
			return JSON.parse(text) as J;
		} catch (e) {
			return null;
		}
	}

	async testConnection(): Promise<boolean> {
		const response = await this._tryRequest(
			this._getURL('config/server/version'),
			this._get
		);
		return response?.statusCode === 200;
	}

	async getChange(
		changeId: string,
		...withValues: never[]
	): Promise<GerritChange | null>;
	async getChange(
		changeId: string,
		...withValues: GerritAPIWith.LABELS[]
	): Promise<InstanceType<WithValue<typeof GerritChange, 'labels'>> | null>;
	async getChange(
		changeId: string,
		...withValues: GerritAPIWith.DETAILED_LABELS[]
	): Promise<InstanceType<
		WithValue<typeof GerritChange, 'detailedLabels'>
	> | null>;
	async getChange(
		changeId: string,
		...withValues: GerritAPIWith[]
	): Promise<GerritChange | null>;
	async getChange(
		changeId: string,
		...withValues: GerritAPIWith[]
	): Promise<GerritChange | any | null> {
		const response = await this._tryRequest(
			this._getURL(`changes/${changeId}/detail/`),
			{
				...this._get,
				searchParams: new URLSearchParams(
					withValues.map((v) => ['o', v] as [string, string])
				),
			}
		);

		if (!response || response.statusCode !== 200) {
			return null;
		}

		const json = this._tryParseJSON<GerritChangeResponse>(
			response.strippedBody
		);
		if (!json) {
			return null;
		}

		const change = new GerritChange(json);
		getChangeCache().set(changeId, withValues, change);
		return change;
	}

	async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: never[]
	): Promise<GerritChange[]>;
	async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith.LABELS[]
	): Promise<InstanceType<WithValue<typeof GerritChange, 'labels'>>[]>;
	async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith.DETAILED_LABELS[]
	): Promise<
		InstanceType<WithValue<typeof GerritChange, 'detailedLabels'>>[]
	>;
	async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith[]
	): Promise<GerritChange[]>;
	async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith[]
	): Promise<GerritChange[] | any> {
		const params = new URLSearchParams([
			...filters.map((filter) => {
				return ['q', filter.join(' ')] as [string, string];
			}),
			...withValues.map((v) => ['o', v] as [string, string]),
		]);
		console.log([...params.entries()]);
		const response = await this._tryRequest(this._getURL(`changes/`), {
			...this._get,
			searchParams: new URLSearchParams([
				...filters.map((filter) => {
					return ['q', filter.join(' ')] as [string, string];
				}),
				...withValues.map((v) => ['o', v] as [string, string]),
			]),
		});

		if (!response || response.statusCode !== 200) {
			return [];
		}

		const json = this._tryParseJSON<GerritChangeResponse[]>(
			response.strippedBody
		);
		if (!json) {
			return [];
		}

		const changes = json.map((p) => new GerritChange(p));
		const cache = getChangeCache();
		changes.forEach((change) =>
			cache.set(change.change_id, withValues, change)
		);
		return changes;
	}
}
