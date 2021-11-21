import {
	GerritChangeResponse,
	GerritChangeLabels,
	GerritChangeStatus,
	GerritDetailedChangeLabels,
	GerritDetailedUser,
	GerritUser,
} from '../types/gerritAPI';
import got, { OptionsOfTextResponseBody, Response } from 'got';
import { showInvalidSettingsMessage } from './messages';
import { getChangeCache } from './gerritCache';
import { getConfiguration } from './config';
import { runWith, Wither } from './util';
import { URLSearchParams } from 'url';
import { window } from 'vscode';
import { log } from './log';

export enum GerritAPIWith {
	LABELS = 'LABELS',
	DETAILED_LABELS = 'DETAILED_LABELS',
	DETAILED_ACCOUNTS = 'DETAILED_ACCOUNTS',
}

let disableRecursionFlag = false;
const disableRecursionWither: Wither = {
	setup: () => (disableRecursionFlag = true),
	breakDown: () => (disableRecursionFlag = false),
};

export class GerritChange {
	public id: string;
	public project: string;
	public branch: string;
	public change_id: string;
	public subject: string;
	public status: GerritChangeStatus;
	public created: string;
	public updated: string;
	public mergeable: boolean;
	public insertions: number;
	public deletions: number;
	public _number: number;
	public work_in_progress?: boolean;
	public owner: GerritUser;

	// Ideally this would be private but in order to make the typing
	// below work we use public
	public _labels: GerritChangeLabels | null = null;
	public _detailedLabels: GerritDetailedChangeLabels | null = null;
	public _detailedOwner: GerritDetailedUser | null = null;

	private _fieldFallbackGetter<K extends keyof GerritChange>(
		fieldName: K,
		flag: GerritAPIWith,
		remoteField: keyof GerritChange
	): Promise<GerritChange[K] | null> {
		return (async () => {
			if (this[fieldName]) {
				return this[fieldName];
			}

			if (disableRecursionFlag) {
				return null;
			}

			const api = getAPI();
			if (!api) {
				return null;
			}

			const res = await api.getChange(this.id, flag);
			if (!res) {
				return null;
			}

			await runWith(disableRecursionWither, async () => {
				(this as any)[fieldName] = (await res[remoteField]) as any;
			});
			return this[fieldName];
		})();
	}

	public get labels(): Promise<GerritChangeLabels | null> {
		return this._fieldFallbackGetter(
			'_labels',
			GerritAPIWith.LABELS,
			'labels'
		);
	}

	public get detailedLabels(): Promise<GerritDetailedChangeLabels | null> {
		return this._fieldFallbackGetter(
			'_detailedLabels',
			GerritAPIWith.DETAILED_LABELS,
			'detailedLabels'
		);
	}

	public get detailedOwner(): Promise<GerritDetailedUser | null> {
		return this._fieldFallbackGetter(
			'_detailedOwner',
			GerritAPIWith.DETAILED_ACCOUNTS,
			'detailedOwner'
		);
	}

	constructor(response: GerritChangeResponse) {
		this.id = response.id;
		this.project = response.project;
		this.branch = response.branch;
		this.change_id = response.change_id;
		this.subject = response.subject;
		this.status = response.status;
		this.created = response.created;
		this.updated = response.updated;
		this.mergeable = response.mergeable;
		this.insertions = response.insertions;
		this.deletions = response.deletions;
		this._number = response._number;
		this.work_in_progress = response.work_in_progress;
		this.owner = response.owner;

		if (response.labels) {
			this._labels = response.labels;
			if (Object.values(response.labels).some((v) => 'all' in v)) {
				this._detailedLabels =
					response.labels as GerritDetailedChangeLabels;
			}
		}
		if (
			'display_name' in response.owner ||
			'email' in response.owner ||
			'username' in response.owner ||
			'name' in response.owner
		) {
			this._detailedOwner = response.owner;
		}
	}
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
			this._getURL('changes'),
			this._get
		);
		// This returns "Not Found" when nothing is found but
		// "Unauthorized" when auth fails
		return response?.strippedBody.trim() === 'Not Found';
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
}

let api: GerritAPI | null = null;
let lastConfig: {
	url: string | undefined;
	username: string | undefined;
	password: string | undefined;
} | null = null;

function hasSameConfig(
	url: string | undefined,
	username: string | undefined,
	password: string | undefined
): boolean {
	return (
		url === lastConfig?.url &&
		username === lastConfig?.username &&
		password === lastConfig?.password
	);
}

export function createAPI() {
	const config = getConfiguration();
	const url = config.get('gerrit.url');
	const username = config.get('gerrit.username');
	const password = config.get('gerrit.password');

	if (!url || !username || !password) {
		if (!hasSameConfig(url, username, password)) {
			log(
				'Missing URL, username or password. Please set them in your settings. (gerrit.{url|username|password})'
			);
			showInvalidSettingsMessage(
				'Missing Gerrit API connection settings. Please enter them using the "Gerrit credentials" command or in your settings file'
			);
		}
		lastConfig = { url, username, password };
		return null;
	}

	const api = new GerritAPI(url, username, password);
	return api;
}

export function getAPI(): GerritAPI | null {
	if (api) {
		return api;
	}

	return (api = createAPI());
}
