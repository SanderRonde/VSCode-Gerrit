import {
	GerritChangeDetailResponse,
	GerritChangeResponse,
	GerritCommentRange,
	GerritCommentResponse,
	GerritCommentSide,
	GerritCommentsResponse,
	GerritDetailedUserResponse,
	GerritFilesResponse,
	GerritGroupsResponse,
	GerritMergeableInfoResponse,
	GerritProjectsResponse,
	GerritSuggestedReviewerResponse,
	GerritTopicResponse,
} from './types';
import {
	CacheContainer,
	createCacheGetter,
	createCacheSetter,
	MultiLevelCacheContainer,
} from '../../util/cache';
import { PATCHSET_LEVEL_KEY } from '../../../views/activityBar/changes/changeTreeView/patchSetLevelCommentsTreeView';
import got, {
	OptionsOfTextResponseBody,
	PromiseCookieJar,
	Response,
} from 'got/dist/source';
import { fileCache } from '../../../views/activityBar/changes/changeTreeView/file/fileCache';
import {
	APISubscriptionManager,
	Subscribable,
} from '../../subscriptions/subscriptions';
import { PatchsetDescription } from '../../../views/activityBar/changes/changeTreeView';
import { DefaultChangeFilter, GerritChangeFilter, filterAnd } from './filters';
import { ChangeField } from '../../subscriptions/changeSubscription';
import { GerritComment, GerritDraftComment } from './gerritComment';
import { GitReviewFile } from '../../credentials/gitReviewFile';
import { GerritChangeMergeable } from './gerritChangeMergeable';
import { FileMeta } from '../../../providers/fileProvider';
import { GerritChangeDetail } from './gerritChangeDetail';
import { optionalObjectProperty } from '../../util/util';
import { getConfiguration } from '../../vscode/config';
import { GerritFile, TextContent } from './gerritFile';
import { READONLY_MODE } from '../../util/constants';
import { shouldDebugRequests } from '../../util/dev';
import { VersionNumber } from '../../util/version';
import { GerritProject } from './gerritProject';
import { GerritChange } from './gerritChange';
import { log, logDev } from '../../util/log';
import { GerritGroup } from './gerritGroup';
import { GerritUser } from './gerritUser';
import { URLSearchParams } from 'url';
import { window } from 'vscode';

export enum GerritAPIWith {
	LABELS = 'LABELS',
	DETAILED_LABELS = 'DETAILED_LABELS',
	DETAILED_ACCOUNTS = 'DETAILED_ACCOUNTS',
	CURRENT_REVISION = 'CURRENT_REVISION',
	CURRENT_COMMIT = 'CURRENT_COMMIT',
	CURRENT_FILES = 'CURRENT_FILES',
	ALL_FILES = 'ALL_FILES',
	ALL_REVISIONS = 'ALL_REVISIONS',
}

interface ResponseWithBody<T> extends Response<T> {
	strippedBody: string;
}

export interface ChangesOffsetParams {
	count?: number;
	offset?: number;
}

/**
 * A bit overengineered but hey who cares
 */
type UserCacheMap = CacheContainer<
	string,
	{
		map: UserCacheMap;
	} & (
		| {
				complete: boolean;
				entries: GerritUser[];
		  }
		| {
				entries?: undefined;
		  }
	)
>;

// Try to find out whether any cache enties have queries
// that contain the current query. For example searching for
// "s" will return what searching for "sa" returns and some more.
// So if we search for "sa" we want to use the cache for "s" and
// leave filtering to the caller. Note that this doesn't always hold.
// If the API only sends us 10 out of 100 entries, not all entries that
// match the "sa" query will be in there. So we also need to check whether
// the cache entries is "complete" in the sense that the API sent us back
// every match. We do this by checking the `_more_accounts` or `hasMore`
// field on the last match. If this is set, the server didn't send us
// everything and we can't use that entry.
class UserCache {
	private static readonly _userCache: UserCacheMap = new CacheContainer();

	public static get(query: string): GerritUser[] | null {
		let currentMap = this._userCache;
		for (let i = 0; i < query.length - 1; i++) {
			const char = query[i];
			if (!currentMap.has(char)) {
				return null;
			}
			const currentEntry = currentMap.get(char)!;
			if (currentEntry.entries && currentEntry.complete) {
				return currentEntry.entries;
			}
			currentMap = currentEntry.map;
		}

		const lastEntry = currentMap.get(query[query.length - 1]);
		if (!lastEntry) {
			return null;
		}

		// Return regardless of whether they're complete since this is the
		// same result we'd get if we perfored the query again
		return lastEntry.entries ?? null;
	}

	public static set(query: string, users: GerritUser[]): void {
		let currentMap = this._userCache;
		for (let i = 0; i < query.length - 1; i++) {
			const char = query[i];
			if (!currentMap.has(char)) {
				currentMap.set(char, {
					map: new CacheContainer(),
				});
			}
			currentMap = currentMap.get(char)!.map;
		}
		currentMap.set(query[query.length - 1], {
			entries: users,
			complete: users.length === 0 || !users[users.length - 1].hasMore,
			map: new CacheContainer(),
		});
	}
}

type RequestBodyOptions = Omit<OptionsOfTextResponseBody, 'searchParams'>;

interface RequestOptions {
	path: string;
	unauthenticated?: boolean;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	body?: RequestBodyOptions['body'];
	searchParams?: Record<string, string | string[]>;
	onError?:
		| ((code: number | undefined, body: string) => void | Promise<void>)
		| null;
}

export class GerritAPI {
	private static _reviewerSuggestionCache: MultiLevelCacheContainer<
		string,
		string | undefined,
		(GerritUser | GerritGroup)[]
	> = new MultiLevelCacheContainer();
	private static _ccSuggestionCache: MultiLevelCacheContainer<
		string,
		string | undefined,
		(GerritUser | GerritGroup)[]
	> = new MultiLevelCacheContainer();
	private readonly _MAGIC_PREFIX = ")]}'";
	private _inFlightRequests: Map<string, Promise<ResponseWithBody<string>>> =
		new Map();

	public getProjects = createCacheSetter(
		'api.getProjects',
		async (): Promise<GerritProject[]> => {
			const response = await this._tryRequest({
				path: 'projects/',
				method: 'GET',
				searchParams: { d: '' },
			});

			const json = this._handleResponse<GerritProjectsResponse>(response);
			if (!json) {
				return [];
			}

			const projects = Object.entries(json).map(
				([projectName, projectJson]) =>
					new GerritProject(projectName, projectJson)
			);
			return projects;
		}
	);

	public getProjectsCached = createCacheGetter<Promise<GerritProject[]>, []>(
		'api.getProjects'
	);

	public getGroups = createCacheSetter(
		'api.getGroups',
		async (): Promise<GerritGroup[]> => {
			const response = await this._tryRequest({
				path: 'groups/',
				method: 'GET',
			});

			const json = this._handleResponse<GerritGroupsResponse>(response);
			if (!json) {
				return [];
			}

			return Object.entries(json).map(
				([groupName, groupJson]) =>
					new GerritGroup(groupName, groupJson)
			);
		}
	);

	public getGroupsCached = createCacheGetter<Promise<GerritGroup[]>, []>(
		'api.getGroups'
	);

	private _getCookieJar(
		options: RequestOptions
	): (PromiseCookieJar & { cookieString: string }) | undefined {
		// This is secretly a proxy... So we need to spread it to make it writable
		const cookies = { ...(this._extraCookies ?? {}) };
		if (this._authCookie && options.method === 'GET') {
			cookies['GerritAccount'] = this._authCookie;
		}

		if (Object.entries(cookies).length === 0) {
			return;
		}

		const cookieString = Object.entries(cookies)
			.map(([key, value]) => `${key}=${value}`)
			.join(';');
		return {
			getCookieString: () => {
				return Promise.resolve(cookieString);
			},
			cookieString,
			setCookie: () => Promise.resolve(),
		};
	}

	public constructor(
		private readonly _url: string | null,
		private readonly _username: string | null,
		private readonly _password: string | null,
		private readonly _authCookie: string | null,
		private readonly _extraCookies: Record<string, string> | null,
		private readonly _gitReviewFile: GitReviewFile | null,
		private readonly _allowFail: boolean = false
	) {}

	public static async performRequest(
		url: string,
		body?: RequestBodyOptions
	): Promise<ResponseWithBody<string>> {
		return (await got(url, {
			...body,
			https: {
				rejectUnauthorized: !getConfiguration().get(
					'gerrit.allowInvalidSSLCerts',
					false
				),
			},
		})) as ResponseWithBody<string>;
	}

	private _headers(withContent: boolean): Record<string, string | undefined> {
		const headers: Record<string, string | undefined> = {};
		if (withContent) {
			headers['Content-Type'] = 'application/json';
		}
		if (this._username && this._password) {
			headers['Authorization'] =
				'Basic ' +
				Buffer.from(`${this._username}:${this._password}`).toString(
					'base64'
				);
		}
		return headers;
	}

	private _stripMagicPrefix(body: string): string {
		if (!body.startsWith(this._MAGIC_PREFIX)) {
			return body.trim();
		}
		return body.slice(this._MAGIC_PREFIX.length).trim();
	}

	private _stringify(rootValue: unknown): string {
		return JSON.stringify(rootValue, (_key, value) => {
			if (value instanceof URLSearchParams) {
				const obj: Record<string, string[]> = {};
				for (const key of value.keys()) {
					obj[key] = value.getAll(key);
				}
				return JSON.stringify(obj);
			}
			if (typeof value !== 'object' || !value) {
				return JSON.stringify(value);
			}

			return JSON.stringify(
				Object.fromEntries(
					Object.entries(value as Record<string, unknown>).map(
						(key, value) => {
							return [key, this._stringify(value)];
						}
					)
				)
			);
		});
	}

	private _createRequestID(url: string, body?: RequestBodyOptions): string {
		return `${url}|${this._stringify(body)}`;
	}

	/**
	 * Sometimes it happens that the same request is being
	 * performed in two places at the same time. It's kind of
	 * useless to perform it twice, so here we check if the
	 * request is the same as one that is in-flight and, if so,
	 * link up the responses.
	 */
	private async _syncUpSameRequests(
		url: string,
		body?: RequestBodyOptions
	): Promise<ResponseWithBody<string>> {
		// Non-get requests perform some remote action, we can't
		// just assume that that action only needs to happen once
		if (body && body.method !== 'GET') {
			return GerritAPI.performRequest(url, body);
		}

		const id = this._createRequestID(url, body);
		if (this._inFlightRequests.has(id)) {
			return this._inFlightRequests.get(id)!;
		}

		log(`${body?.method || 'GET'} request to "${url}"`);

		const req = GerritAPI.performRequest(url, body);
		this._inFlightRequests.set(id, req);
		const response = await req;
		this._inFlightRequests.delete(id);
		return response;
	}

	/**
	 * Gets the path to given URL. Note that the trailing slash
	 * is included.
	 */
	public getPublicUrl(path: string): string {
		if (!this._url) {
			return '';
		}
		const trailingSlash = this._url.endsWith('/') ? '' : '/';
		return this._url + trailingSlash + path;
	}

	private _getUrlAndParams(options: RequestOptions): {
		url: string | null;
		searchParams: RequestOptions['searchParams'];
	} {
		const searchParams = options.searchParams ?? {};
		let url = '';
		if (this._url) {
			const trailingSlash = this._url.endsWith('/') ? '' : '/';
			url = this._url + trailingSlash;
			if (!options.unauthenticated) {
				const authUrlPrefix = getConfiguration().get(
					'gerrit.customAuthUrlPrefix',
					'a/'
				);
				url += `${authUrlPrefix}${options.path}`;
				if (this._authCookie && options.method !== 'GET') {
					searchParams['access_token'] = this._authCookie;
				}
			} else {
				url += options.path;
			}
			if (searchParams && Object.keys(searchParams).length) {
				const query: string[] = [];
				for (const key in searchParams) {
					const value = searchParams[key];
					if (Array.isArray(value)) {
						query.push(
							...value.map(
								(v) => `${key}=${encodeURIComponent(v)}`
							)
						);
					} else {
						query.push(`${key}=${value}`);
					}
				}
				url += `?${query.join('&')}`;
			}
		}
		return {
			url: url || null,
			searchParams,
		};
	}

	private async _tryRequest(
		options: RequestOptions
	): Promise<(Response<string> & { strippedBody: string }) | null> {
		const { url, searchParams } = this._getUrlAndParams(options);

		if (!url) {
			log('No URL configured');
			return null;
		}

		const body: RequestBodyOptions = {
			method: options.method,
			body: options.body,
			cookieJar: this._getCookieJar(options),
			headers: this._headers(
				options.method === 'POST' || options.method === 'PUT'
			),
		};

		if (shouldDebugRequests()) {
			logDev({
				...body,
				searchParams: searchParams,
				stack: new Error().stack!.split('\n'),
			});
		}
		if (READONLY_MODE && options.method !== 'GET') {
			void window.showErrorMessage(
				'Canceled request trying to modify data in readonly mode'
			);
			return null;
		}
		try {
			const response = await this._syncUpSameRequests(url, body);
			response.strippedBody = this._stripMagicPrefix(response.body);
			return response;
		} catch (e) {
			const err = e as {
				response: {
					body: string;
					statusCode: number;
				};
			};
			log(
				err.toString(),
				err?.response?.statusCode.toString(),
				err?.response?.toString(),
				err?.response?.body.toString()
			);
			if (options.onError !== undefined) {
				await options.onError?.(
					err.response?.statusCode,
					err.response.body
				);
			} else if (!this._allowFail) {
				void window.showErrorMessage(
					`Gerrit request to "${url}" failed. Please check your settings and/or connection`
				);
			}
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

	private _assertResponse(
		response: null | Response<string>
	): response is Response<string> {
		if (!response) {
			log('Invalid response');
			return false;
		}
		return true;
	}

	private _assertRequestSucceeded(response: Response<string>): boolean {
		const succeeded =
			response.statusCode > 199 && response.statusCode < 300;
		if (!succeeded) {
			log(`Request failed: ${response.statusCode}`);
		}
		return succeeded;
	}

	private _handleResponse<T>(
		response:
			| null
			| (Response<string> & {
					strippedBody: string;
			  })
	): T | null {
		if (
			!this._assertResponse(response) ||
			!this._assertRequestSucceeded(response)
		) {
			return null;
		}
		const parsed = this._tryParseJSON<T>(response.strippedBody);
		if (!parsed) {
			log(`Failed to parse response JSON: ${response.strippedBody}`);
			return null;
		}
		return parsed;
	}

	private async _getCommentsShared(
		changeID: string,
		type: 'drafts' | 'comments'
	): Promise<GerritCommentsResponse | null> {
		const response = await this._tryRequest({
			path: `changes/${changeID}/${type}/`,
			method: 'GET',
		});

		return this._handleResponse<GerritCommentsResponse>(response);
	}

	private async _suggestPersonShared(
		changeID: string,
		query?: string,
		maxCount: number = 10,
		extra?: Record<string, string | string[]>
	): Promise<(GerritUser | GerritGroup)[]> {
		const response = await this._tryRequest({
			path: `changes/${changeID}/suggest_reviewers/`,
			method: 'GET',
			searchParams: {
				...optionalObjectProperty({
					q: query,
				}),
				n: String(maxCount),
				...extra,
			},
		});

		const json =
			this._handleResponse<GerritSuggestedReviewerResponse>(response);
		if (!json) {
			return [];
		}

		return json.map((entry) => {
			if ('account' in entry) {
				return new GerritUser(entry.account);
			} else {
				return new GerritGroup(entry.group.name, entry.group);
			}
		});
	}

	private _getReviewerCCChanges(
		previousReviewers: (GerritUser | GerritGroup)[],
		previousCC: (GerritUser | GerritGroup)[],
		reviewers: (string | number)[],
		cc: (string | number)[]
	): {
		removed: (string | number)[];
		addedToCC: (string | number)[];
		addedToReviewers: (string | number)[];
	} {
		const previousUsers: Map<string | number, 'cc' | 'reviewer'> = new Map([
			...previousReviewers.map(
				(user) =>
					[
						user instanceof GerritUser ? user.accountID : user.id,
						'reviewer',
					] as [string | number, 'reviewer']
			),
			...previousCC.map(
				(user) =>
					[
						user instanceof GerritUser ? user.accountID : user.id,
						'cc',
					] as [string | number, 'cc']
			),
		]);

		const newUsers: Map<string | number, 'cc' | 'reviewer'> = new Map([
			...reviewers.map(
				(r) => [r, 'reviewer'] as [string | number, 'reviewer']
			),
			...cc.map((c) => [c, 'cc'] as [string | number, 'cc']),
		]);

		// Anyone who was in the last group but not in the new group is removed
		const removed: (string | number)[] = [];
		for (const user of previousUsers.keys()) {
			if (!newUsers.has(user)) {
				removed.push(user);
			}
		}

		// Anyone who is now a reviewer but was a CC (or nothing at all) is added to CC
		const addedToCC: (string | number)[] = [];
		const addedToReviewers: (string | number)[] = [];
		for (const newUser of newUsers.keys()) {
			if (
				!previousUsers.has(newUser) ||
				previousUsers.get(newUser) !== newUsers.get(newUser)
			) {
				if (newUsers.get(newUser) === 'cc') {
					addedToCC.push(newUser);
				} else {
					addedToReviewers.push(newUser);
				}
			}
		}

		// The rest has stayed the same so we leave them alone
		return {
			addedToCC,
			addedToReviewers,
			removed,
		};
	}

	private _applyAdditionalFilter(): (existingFilter: string) => string {
		let projectFilter: string | undefined;
		const config = getConfiguration();
		if (config.get('gerrit.filterByProject', true)) {
			if (this._gitReviewFile) {
				const projectName = this._gitReviewFile.project.endsWith('.git')
					? this._gitReviewFile.project.slice(0, -'.git'.length)
					: this._gitReviewFile.project;
				projectFilter = `project:${projectName}`;
			}
		}

		return (existingFilter: string) => {
			if (projectFilter) {
				return filterAnd(existingFilter, projectFilter);
			}
			return existingFilter;
		};
	}

	public async testConnection(): Promise<{
		exists: boolean;
		authenticated: boolean;
		runCurlCommand: () => void;
	}> {
		const versionConfig: RequestOptions = {
			path: 'config/server/version',
			method: 'GET',
			onError: null,
		};
		const versionResponse = await this._tryRequest(versionConfig);
		const selfConfig: RequestOptions = {
			path: 'accounts/self',
			method: 'GET',
			onError: null,
		};
		const selfResponse = await this._tryRequest(selfConfig);

		return {
			exists: versionResponse?.statusCode === 200,
			authenticated: selfResponse?.statusCode === 200,
			runCurlCommand: () => {
				const terminal = window.createTerminal('cUrl');
				const userArg =
					this._username && this._password
						? ` --user "${this._username}:${this._password}"`
						: '';
				let cookieArg = '';
				const cookieJar = this._getCookieJar(selfConfig);
				if (cookieJar?.cookieString) {
					cookieArg = ` --cookie "${cookieJar.cookieString}"`;
				}

				const versionUrl =
					this._getUrlAndParams(versionConfig).url ?? '<no-url>';
				const selfUrl =
					this._getUrlAndParams(selfConfig).url ?? '<no-url>';
				terminal.sendText(
					`echo "Unauthenticated: " && curl${cookieArg} "${versionUrl}" && echo -e "\\nAuthenticated:" && curl${userArg}${cookieArg} "${selfUrl}"`,
					false
				);
				terminal.show();
			},
		};
	}

	public getChange(
		changeID: string,
		field: ChangeField | null,
		withValues: GerritAPIWith[] = []
	): Subscribable<GerritChange | null> {
		return APISubscriptionManager.changeSubscriptions.createFetcher(
			{
				changeID,
				withValues,
				field,
			},
			async () => {
				const response = await this._tryRequest({
					path: `changes/${changeID}/detail/`,
					method: 'GET',
					searchParams: optionalObjectProperty({
						o: withValues.length ? withValues : undefined,
					}),
				});

				const json =
					this._handleResponse<GerritChangeResponse>(response);
				if (!json) {
					return null;
				}

				return new GerritChange(
					json,
					withValues.includes(GerritAPIWith.ALL_REVISIONS)
				);
			}
		);
	}

	public getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		offsetParams: ChangesOffsetParams | undefined,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: GerritAPIWith[]
	): Subscribable<GerritChange[]> {
		const additionalFilter = this._applyAdditionalFilter();

		const queryParams: Record<string, string | string[]> = {};
		queryParams['q'] = filters.map((filter) => {
			const subFilters = filter.filter((subFilter) => {
				return !subFilter.includes('is:ignored');
			});

			return additionalFilter(subFilters.join(' '));
		});
		if (withValues.length) {
			queryParams['o'] = withValues;
		}
		if (typeof offsetParams?.count === 'number') {
			queryParams['n'] = String(offsetParams.count);
		}
		if (typeof offsetParams?.offset === 'number') {
			queryParams['S'] = String(offsetParams.offset);
		}

		return APISubscriptionManager.changesSubscriptions.createFetcher(
			{
				filters,
				offsetParams,
				withValues,
				query: '',
			},
			async () => {
				const response = await this._tryRequest({
					path: 'changes/',
					method: 'GET',
					searchParams: queryParams,
					onError,
				});

				const json =
					this._handleResponse<GerritChangeResponse[]>(response);
				if (!json) {
					return [];
				}

				return json.map(
					(p) =>
						new GerritChange(
							p,
							withValues.includes(GerritAPIWith.ALL_REVISIONS)
						)
				);
			}
		);
	}

	public searchChanges(
		query: string,
		offsetParams: ChangesOffsetParams | undefined,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: GerritAPIWith[]
	): Subscribable<GerritChange[]> {
		const queryParams: Record<string, string | string[]> = {};
		queryParams['q'] = this._applyAdditionalFilter()(query);
		if (withValues.length) {
			queryParams['o'] = withValues;
		}
		if (typeof offsetParams?.count === 'number') {
			queryParams['n'] = String(offsetParams.count);
		}
		if (typeof offsetParams?.offset === 'number') {
			queryParams['S'] = String(offsetParams.offset);
		}

		return APISubscriptionManager.changesSubscriptions.createFetcher(
			{
				query,
				filters: [],
				offsetParams,
				withValues,
			},
			async () => {
				const response = await this._tryRequest({
					path: 'changes/',
					method: 'GET',
					searchParams: queryParams,
					onError,
				});

				const json =
					this._handleResponse<GerritChangeResponse[]>(response);
				if (!json) {
					return [];
				}

				return json.map(
					(p) =>
						new GerritChange(
							p,
							withValues.includes(GerritAPIWith.ALL_REVISIONS)
						)
				);
			}
		);
	}

	public getComments(
		changeID: string
	): Subscribable<Map<string, GerritComment[]>> {
		return APISubscriptionManager.commentsSubscriptions.createFetcher(
			{
				changeID,
				withValues: [],
				field: null,
			},
			async () => {
				const json = await this._getCommentsShared(
					changeID,
					'comments'
				);
				if (!json) {
					return new Map();
				}

				const map = new Map<string, GerritComment[]>();
				for (const filePath in json) {
					const comments = json[filePath];
					map.set(
						filePath,
						await Promise.all(
							comments.map((c) =>
								GerritComment.from(changeID, filePath, c)
							)
						)
					);
				}
				return map;
			}
		);
	}

	public getDraftComments(
		changeID: string
	): Subscribable<Map<string, GerritDraftComment[]>> {
		return APISubscriptionManager.draftCommentsSubscriptions.createFetcher(
			{
				changeID,
				withValues: [],
				field: null,
			},
			async () => {
				const json = await this._getCommentsShared(changeID, 'drafts');
				if (!json) {
					return new Map();
				}

				const map = new Map<string, GerritDraftComment[]>();
				for (const filePath in json) {
					const comments = json[filePath];
					map.set(
						filePath,
						await Promise.all(
							comments.map((c) =>
								GerritDraftComment.from(changeID, filePath, c)
							)
						)
					);
				}
				return map;
			}
		);
	}

	public getFiles(
		changeID: string,
		changeProject: string,
		revision: PatchsetDescription,
		baseRevision?: PatchsetDescription
	): Subscribable<Record<string, GerritFile>> {
		return APISubscriptionManager.filesSubscriptions.createFetcher(
			{
				changeID: changeID,
				revision,
				baseRevision: baseRevision ?? null,
			},
			async () => {
				const response = await this._tryRequest({
					path: `changes/${changeID}/revisions/${revision.id}/files`,
					method: 'GET',
					searchParams: baseRevision
						? {
								base: String(baseRevision.id),
							}
						: undefined,
				});

				const json =
					this._handleResponse<GerritFilesResponse>(response);
				if (!json) {
					return {};
				}

				return Object.fromEntries(
					Object.entries(json)
						.filter(([path]) => path !== '/COMMIT_MSG')
						.map(([path, file]) => {
							return [
								path,
								new GerritFile(
									changeID,
									changeProject,
									revision,
									path,
									file
								),
							];
						})
				);
			}
		);
	}

	public async getTopic(
		changeID: string
	): Promise<GerritTopicResponse | null> {
		const response = await this._tryRequest({
			path: `changes/${changeID}/topic`,
			method: 'GET',
		});
		return this._handleResponse<GerritTopicResponse>(response);
	}

	public async getFileContent({
		project,
		commit,
		changeID,
		filePath,
	}: {
		project: string;
		commit: PatchsetDescription;
		changeID: string;
		filePath: string;
	}): Promise<TextContent | null> {
		if (
			fileCache.has({
				project,
				path: filePath,
				revision: commit.id,
			})
		) {
			return fileCache.get({
				project,
				path: filePath,
				revision: commit.id,
			});
		}

		const response = await this._tryRequest({
			path: `projects/${encodeURIComponent(project)}/commits/${
				commit.id
			}/files/${encodeURIComponent(filePath)}/content`,
			method: 'GET',
		});

		if (
			!this._assertResponse(response) ||
			!this._assertRequestSucceeded(response)
		) {
			return null;
		}

		const textContent = TextContent.from(
			FileMeta.createFileMeta({
				project,
				commit,
				filePath,
				changeID,
			}),
			response.body,
			'base64'
		);
		if (!textContent) {
			return null;
		}

		fileCache.set(
			{
				project,
				path: filePath,
				revision: commit.id,
			},
			textContent
		);
		return textContent;
	}

	public async createDraftComment({
		content,
		changeID,
		revision,
		filePath,
		unresolved,
		side,
		lineOrRange,
		replyTo,
	}: {
		content: string;
		changeID: string;
		revision: string;
		filePath: string;
		unresolved: boolean;
		side: GerritCommentSide | undefined;
		lineOrRange?: number | GerritCommentRange;
		replyTo?: string;
	}): Promise<GerritDraftComment | null> {
		const response = await this._tryRequest({
			path: `changes/${changeID}/revisions/${revision}/drafts`,
			method: 'PUT',
			body: JSON.stringify({
				path: filePath,
				line: typeof lineOrRange === 'number' ? lineOrRange : undefined,
				range:
					lineOrRange && typeof lineOrRange === 'object'
						? lineOrRange
						: undefined,
				in_reply_to: replyTo,
				message: content,
				unresolved,
				side,
			}),
		});

		const json = this._handleResponse<GerritCommentResponse>(response);
		if (!json) {
			return null;
		}

		return GerritDraftComment.from(changeID, filePath, json);
	}

	public async createPatchSetLevelDraftComment({
		content,
		changeID,
		revision,
		filePath,
		unresolved,
		replyTo,
	}: {
		content: string;
		changeID: string;
		revision: string;
		filePath: string;
		unresolved: boolean;
		replyTo?: string;
	}): Promise<GerritDraftComment | null> {
		const response = await this._tryRequest({
			path: `changes/${changeID}/revisions/${revision}/drafts`,
			method: 'PUT',
			body: JSON.stringify({
				path: filePath,
				in_reply_to: replyTo,
				message: content,
				unresolved,
			}),
		});

		const json = this._handleResponse<GerritCommentResponse>(response);
		if (!json) {
			return null;
		}

		return GerritDraftComment.from(changeID, filePath, json);
	}

	public async updateDraftComment({
		draft,
		changes,
	}: {
		draft: GerritDraftComment;
		changes: {
			content?: string;
			unresolved?: boolean;
		};
	}): Promise<GerritDraftComment | null> {
		const response = await this._tryRequest({
			path: `changes/${draft.changeID}/revisions/${draft.commitID}/drafts/${draft.id}`,
			method: 'PUT',
			body: JSON.stringify({
				commit_id: draft.commitID,
				id: draft.id,
				line: draft.line,
				range: draft.range,
				path: draft.filePath,
				updated: draft.updated.source,
				message: changes.content,
				unresolved: changes.unresolved,
				patch_set: draft.patchSet,
				__draft: true,
			}),
		});

		const json = this._handleResponse<GerritCommentResponse>(response);
		if (!json) {
			return null;
		}

		return GerritDraftComment.from(draft.changeID, draft.filePath, json);
	}

	public async deleteDraftComment(
		draft: GerritDraftComment
	): Promise<boolean> {
		const response = await this._tryRequest({
			path: `changes/${draft.changeID}/revisions/${draft.commitID}/drafts/${draft.id}`,
			method: 'DELETE',
		});

		return (
			this._assertResponse(response) &&
			this._assertRequestSucceeded(response)
		);
	}

	public async getSelf(): Promise<GerritUser | null> {
		const response = await this._tryRequest({
			path: 'accounts/self',
			method: 'GET',
		});

		const json = this._handleResponse<GerritDetailedUserResponse>(response);
		if (!json) {
			return null;
		}

		return new GerritUser(json);
	}

	public async getUsers(
		query: string,
		maxCount: number = 10
	): Promise<GerritUser[]> {
		const response = await this._tryRequest({
			path: 'accounts/',
			method: 'GET',
			searchParams: {
				suggest: '',
				q: query,
				n: maxCount.toString(),
			},
		});

		const json =
			this._handleResponse<GerritDetailedUserResponse[]>(response);
		if (!json) {
			return [];
		}

		return json.map((userJson) => new GerritUser(userJson));
	}

	public async getUsersCached(
		query: string,
		maxCount: number = 10
	): Promise<GerritUser[]> {
		const cached = UserCache.get(query);
		if (cached) {
			return cached;
		}

		const users = await this.getUsers(query, maxCount);
		UserCache.set(query, users);
		return users;
	}

	public async getChangeDetail(
		changeID: string
	): Promise<GerritChangeDetail | null> {
		const response = await this._tryRequest({
			path: `changes/${changeID}/detail/`,
			method: 'GET',
		});

		const json = this._handleResponse<GerritChangeDetailResponse>(response);
		if (!json) {
			return null;
		}

		return new GerritChangeDetail(json);
	}

	public async getChangeMergable(
		changeID: string
	): Promise<GerritChangeMergeable | null> {
		const response = await this._tryRequest({
			path: `changes/${changeID}/revisions/current/mergeable`,
			method: 'GET',
		});

		const json =
			this._handleResponse<GerritMergeableInfoResponse>(response);
		if (!json) {
			return null;
		}

		return new GerritChangeMergeable(json);
	}

	public async suggestReviewers(
		changeID: string,
		query?: string,
		maxCount: number = 10
	): Promise<(GerritUser | GerritGroup)[]> {
		if (GerritAPI._reviewerSuggestionCache.has(changeID, query)) {
			return GerritAPI._reviewerSuggestionCache.get(changeID, query)!;
		}

		const suggestions = await this._suggestPersonShared(
			changeID,
			query,
			maxCount
		);
		GerritAPI._reviewerSuggestionCache.set(changeID, query, suggestions);
		return suggestions;
	}

	public async suggestCC(
		changeID: string,
		query?: string,
		maxCount: number = 10
	): Promise<(GerritUser | GerritGroup)[]> {
		if (GerritAPI._ccSuggestionCache.has(changeID, query)) {
			return GerritAPI._ccSuggestionCache.get(changeID, query)!;
		}

		const suggestions = await this._suggestPersonShared(
			changeID,
			query,
			maxCount,
			{
				'reviewer-state': 'CC',
			}
		);
		GerritAPI._ccSuggestionCache.set(changeID, query, suggestions);
		return suggestions;
	}

	public async setReview(
		changeID: string,
		revisionID: string,
		options: {
			message?: string;
			resolved?: boolean;
			labels?: Record<string, number>;
			publishDrafts: boolean;
			reviewers: (string | number)[];
			cc: (string | number)[];
		}
	): Promise<boolean> {
		const detail = await this.getChangeDetail(changeID);
		const self = await this.getSelf();
		if (!detail || !self) {
			return false;
		}

		const previousReviewers = detail.reviewers.filter(
			(r) => !(r instanceof GerritUser) || r.accountID !== self.accountID
		);
		const previousCC = detail.cc;

		const changes = this._getReviewerCCChanges(
			previousReviewers,
			previousCC,
			options.reviewers ?? [],
			options.cc ?? []
		);

		const response = await this._tryRequest({
			path: `changes/${changeID}/revisions/${revisionID}/review`,
			method: 'POST',
			body: JSON.stringify(
				optionalObjectProperty({
					labels: options.labels,
					comments: options.message
						? {
								[PATCHSET_LEVEL_KEY]: [
									{
										message: options.message,
										unresolved: !(options.resolved ?? true),
									},
								],
							}
						: undefined,
					drafts: options.publishDrafts
						? 'PUBLISH_ALL_REVISIONS'
						: 'KEEP',
					remove_from_attention_set: changes.removed.map((id) => ({
						user: id,
						reason: `${self.getName(true)} replied to the change`,
					})),
					reviewers: [
						...changes.removed.map((id) => ({
							reviewer: id,
							state: 'REMOVED',
						})),
						...changes.addedToCC.map((id) => ({
							reviewer: id,
							state: 'CC',
						})),
						...changes.addedToReviewers.map((id) => ({
							reviewer: id,
							state: 'REVIEWER',
						})),
					],
					ready: detail.isWip,
				})
			),
		});

		const json = this._handleResponse<Record<string, unknown>>(response);
		if (!json) {
			return false;
		}

		return true;
	}

	public async submit(changeID: string): Promise<boolean> {
		const response = await this._tryRequest({
			path: `changes/${changeID}/submit`,
			method: 'POST',
			body: JSON.stringify({}),
		});

		const json = this._handleResponse<Record<string, unknown>>(response);
		if (!json) {
			return false;
		}

		return json.status === 'MERGED';
	}

	public async getGerritVersion(): Promise<VersionNumber | null> {
		const response = await this._tryRequest({
			path: 'config/server/version',
			unauthenticated: true,
			method: 'GET',
		});

		if (!response || !this._assertRequestSucceeded(response)) {
			return null;
		}

		return VersionNumber.from(response.strippedBody);
	}
}
