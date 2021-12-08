import {
	GerritChangeDetailResponse,
	GerritChangeResponse,
	GerritCommentRange,
	GerritCommentResponse,
	GerritCommentSide,
	GerritCommentsResponse,
	GerritDetailedUserResponse,
	GerritGroupsResponse,
	GerritProjectsResponse,
	GerritSuggestedReviewerResponse,
} from './types';
import { PATCHSET_LEVEL_KEY } from '../../../views/activityBar/changes/changeTreeView/patchSetLevelCommentsTreeView';
import { FileCache } from '../../../views/activityBar/changes/changeTreeView/file/fileCache';
import { optionalArrayEntry, optionalObjectProperty } from '../../util/util';
import got, { OptionsOfTextResponseBody, Response } from 'got/dist/source';
import { DefaultChangeFilter, GerritChangeFilter } from './filters';
import { GerritComment, GerritDraftComment } from './gerritComment';
import { FileMeta } from '../../../providers/fileProvider';
import { GerritChangeDetail } from './gerritChangeDetail';
import { getConfiguration } from '../../vscode/config';
import { shouldDebugRequests } from '../../util/dev';
import { READONLY_MODE } from '../../util/constants';
import { getChangeCache } from '../gerritCache';
import { GerritProject } from './gerritProject';
import { GerritChange } from './gerritChange';
import { GerritGroup } from './gerritGroup';
import { TextContent } from './gerritFile';
import { GerritUser } from './gerritUser';
import { URLSearchParams } from 'url';
import { log } from '../../util/log';
import { window } from 'vscode';

export enum GerritAPIWith {
	LABELS = 'LABELS',
	DETAILED_LABELS = 'DETAILED_LABELS',
	DETAILED_ACCOUNTS = 'DETAILED_ACCOUNTS',
	CURRENT_REVISION = 'CURRENT_REVISION',
	ALL_REVISIONS = 'ALL_REVISIONS',
	CURRENT_COMMIT = 'CURRENT_COMMIT',
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
type UserCacheMap = Map<
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
	private static readonly _userCache: UserCacheMap = new Map();

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
					map: new Map(),
				});
			}
			currentMap = currentMap.get(char)!.map;
		}
		currentMap.set(query[query.length - 1], {
			entries: users,
			complete: users.length === 0 || !users[users.length - 1].hasMore,
			map: new Map(),
		});
	}
}

export class GerritAPI {
	private static _groups: GerritGroup[] | null = null;
	private static _projects: GerritProject[] | null = null;
	private static _reviewerSuggestionCache: Map<
		string,
		Map<string | undefined, (GerritUser | GerritGroup)[]>
	> = new Map();
	private static _ccSuggestionCache: Map<
		string,
		Map<string | undefined, (GerritUser | GerritGroup)[]>
	> = new Map();
	private readonly _MAGIC_PREFIX = ")]}'";
	private _inFlightRequests: Map<string, Promise<ResponseWithBody<string>>> =
		new Map();

	private get _get(): OptionsOfTextResponseBody {
		return {
			method: 'GET',
			headers: this._headers(false),
		};
	}

	private get _post(): OptionsOfTextResponseBody {
		return {
			method: 'POST',
			headers: this._headers(true),
		};
	}

	private get _put(): OptionsOfTextResponseBody {
		return {
			method: 'PUT',
			headers: this._headers(true),
		};
	}

	private get _delete(): OptionsOfTextResponseBody {
		return {
			method: 'DELETE',
			headers: this._headers(false),
		};
	}

	public constructor(
		private readonly _url: string,
		private readonly _username: string,
		private readonly _password: string
	) {}

	public static async performRequest(
		url: string,
		body?: OptionsOfTextResponseBody
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
		return {
			Authorization:
				'Basic ' +
				Buffer.from(`${this._username}:${this._password}`).toString(
					'base64'
				),
			...optionalObjectProperty({
				'Content-Type': withContent ? 'application/json' : undefined,
			}),
		};
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

	private _createRequestID(
		url: string,
		body?: OptionsOfTextResponseBody
	): string {
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
		body?: OptionsOfTextResponseBody
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

		const req = GerritAPI.performRequest(url, body);
		this._inFlightRequests.set(id, req);
		const response = await req;
		this._inFlightRequests.delete(id);
		return response;
	}

	private _makeSearchParamsStringifiable(
		params: URLSearchParams
	): Record<string, string[]> {
		const obj: Record<string, string[]> = {};
		for (const key of params.keys()) {
			obj[key] = params.getAll(key);
		}
		return obj;
	}

	private async _tryRequest(
		url: string,
		body?: OptionsOfTextResponseBody,
		onError?: (
			code: number | undefined,
			body: string
		) => void | Promise<void>
	): Promise<(Response<string> & { strippedBody: string }) | null> {
		log(`${body?.method || 'GET'} request to "${url}"`);
		if (shouldDebugRequests()) {
			console.log({
				...body,
				searchParams:
					body?.searchParams instanceof URLSearchParams
						? this._makeSearchParamsStringifiable(body.searchParams)
						: body?.searchParams,
			});
		}
		if (READONLY_MODE && body?.method !== 'GET') {
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
			if (onError) {
				await onError(err.response?.statusCode, err.response.body);
			} else {
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
		const response = await this._tryRequest(
			this.getURL(`changes/${changeID}/${type}/`),
			this._get
		);

		return this._handleResponse<GerritCommentsResponse>(response);
	}

	private async _suggestPersonShared(
		changeID: string,
		query?: string,
		maxCount: number = 10,
		...extra: [string, string][]
	): Promise<(GerritUser | GerritGroup)[]> {
		const response = await this._tryRequest(
			this.getURL(`changes/${changeID}/suggest_reviewers/`),
			{
				...this._get,
				searchParams: new URLSearchParams([
					...optionalArrayEntry(!!query, [
						['q', query] as [string, string],
					]),
					['n', String(maxCount)],
					...extra,
				]),
			}
		);

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

	public async testConnection(): Promise<boolean> {
		const response = await this._tryRequest(
			this.getURL('config/server/version'),
			this._get
		);
		return response?.statusCode === 200;
	}

	/**
	 * Gets the path to given URL. Note that the trailing slash
	 * is included.
	 */
	public getURL(path: string, auth: boolean = true): string {
		const trailingSlash = this._url.endsWith('/') ? '' : '/';
		const authStr = auth ? 'a/' : '';
		return `${this._url}${trailingSlash}${authStr}${path}`;
	}

	public async getChange(
		changeID: string,
		...withValues: never[]
	): Promise<GerritChange | null>;
	public async getChange(
		changeID: string,
		...withValues: GerritAPIWith.LABELS[]
	): Promise<InstanceType<WithValue<typeof GerritChange, 'labels'>> | null>;
	public async getChange(
		changeID: string,
		...withValues: GerritAPIWith.DETAILED_LABELS[]
	): Promise<InstanceType<
		WithValue<typeof GerritChange, 'detailedLabels'>
	> | null>;
	public async getChange(
		changeID: string,
		...withValues: GerritAPIWith[]
	): Promise<GerritChange | null>;
	public async getChange(
		changeID: string,
		...withValues: GerritAPIWith[]
	): Promise<GerritChange | null> {
		const response = await this._tryRequest(
			this.getURL(`changes/${changeID}/detail/`),
			{
				...this._get,
				searchParams: new URLSearchParams(
					withValues.map((v) => ['o', v] as [string, string])
				),
			}
		);

		const json = this._handleResponse<GerritChangeResponse>(response);
		if (!json) {
			return null;
		}

		const change = new GerritChange(json);
		getChangeCache().set(changeID, withValues, change);
		return change;
	}

	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		offsetParams: ChangesOffsetParams | undefined,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: never[]
	): Promise<GerritChange[]>;
	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		offsetParams: ChangesOffsetParams | undefined,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: GerritAPIWith.LABELS[]
	): Promise<InstanceType<WithValue<typeof GerritChange, 'labels'>>[]>;
	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		offsetParams: ChangesOffsetParams | undefined,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: GerritAPIWith.DETAILED_LABELS[]
	): Promise<
		InstanceType<WithValue<typeof GerritChange, 'detailedLabels'>>[]
	>;
	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		offsetParams: ChangesOffsetParams | undefined,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: GerritAPIWith[]
	): Promise<GerritChange[]>;
	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		offsetParams: ChangesOffsetParams | undefined,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: GerritAPIWith[]
	): Promise<GerritChange[]> {
		const response = await this._tryRequest(
			this.getURL('changes/'),
			{
				...this._get,
				searchParams: new URLSearchParams([
					...filters.map((filter) => {
						return ['q', filter.join(' ')] as [string, string];
					}),
					...withValues.map((v) => ['o', v] as [string, string]),
					...optionalArrayEntry(
						typeof offsetParams?.count === 'number',
						() => [
							['n', String(offsetParams!.count)] as [
								string,
								string
							],
						]
					),
					...optionalArrayEntry(
						typeof offsetParams?.offset === 'number',
						() => [
							['S', String(offsetParams!.offset)] as [
								string,
								string
							],
						]
					),
				]),
			},
			onError
		);

		const json = this._handleResponse<GerritChangeResponse[]>(response);
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

	public async searchChanges(
		query: string,
		offsetParams: ChangesOffsetParams | undefined,
		onError:
			| undefined
			| ((
					code: number | undefined,
					body: string
			  ) => void | Promise<void>),
		...withValues: GerritAPIWith[]
	): Promise<GerritChange[]> {
		const response = await this._tryRequest(
			this.getURL('changes/'),
			{
				...this._get,
				searchParams: new URLSearchParams([
					['q', query],
					...withValues.map((v) => ['o', v] as [string, string]),
					...optionalArrayEntry(
						typeof offsetParams?.count === 'number',
						() => [
							['n', String(offsetParams!.count)] as [
								string,
								string
							],
						]
					),
					...optionalArrayEntry(
						typeof offsetParams?.offset === 'number',
						() => [
							['S', String(offsetParams!.offset)] as [
								string,
								string
							],
						]
					),
				]),
			},
			onError
		);

		const json = this._handleResponse<GerritChangeResponse[]>(response);
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

	public async getComments(
		changeID: string
	): Promise<Map<string, GerritComment[]>> {
		const json = await this._getCommentsShared(changeID, 'comments');
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

	public async getDraftComments(
		changeID: string
	): Promise<Map<string, GerritDraftComment[]>> {
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

	public async getFileContent({
		project,
		commit,
		changeID,
		filePath,
	}: {
		project: string;
		commit: string;
		changeID: string;
		filePath: string;
	}): Promise<TextContent | null> {
		if (FileCache.has(project, commit, filePath)) {
			return FileCache.get(project, commit, filePath);
		}

		const response = await this._tryRequest(
			this.getURL(
				`projects/${project}/commits/${commit}/files/${encodeURIComponent(
					filePath
				)}/content`
			),
			this._get
		);

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

		FileCache.set(project, commit, filePath, textContent);
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
		const response = await this._tryRequest(
			this.getURL(`changes/${changeID}/revisions/${revision}/drafts`),
			{
				...this._put,
				body: JSON.stringify({
					path: filePath,
					line:
						typeof lineOrRange === 'number'
							? lineOrRange
							: undefined,
					range:
						lineOrRange && typeof lineOrRange === 'object'
							? lineOrRange
							: undefined,
					in_reply_to: replyTo,
					message: content,
					unresolved,
					side,
				}),
			}
		);

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
		const response = await this._tryRequest(
			this.getURL(`changes/${changeID}/revisions/${revision}/drafts`),
			{
				...this._put,
				body: JSON.stringify({
					path: filePath,
					in_reply_to: replyTo,
					message: content,
					unresolved,
				}),
			}
		);

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
		const response = await this._tryRequest(
			this.getURL(
				`changes/${draft.changeID}/revisions/${draft.commitID}/drafts/${draft.id}`
			),
			{
				...this._put,
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
			}
		);

		const json = this._handleResponse<GerritCommentResponse>(response);
		if (!json) {
			return null;
		}

		return GerritDraftComment.from(draft.changeID, draft.filePath, json);
	}

	public async deleteDraftComment(
		draft: GerritDraftComment
	): Promise<boolean> {
		const response = await this._tryRequest(
			this.getURL(
				`changes/${draft.changeID}/revisions/${draft.commitID}/drafts/${draft.id}`
			),
			this._delete
		);

		return (
			this._assertResponse(response) &&
			this._assertRequestSucceeded(response)
		);
	}

	public async getSelf(): Promise<GerritUser | null> {
		const response = await this._tryRequest(
			this.getURL('accounts/self'),
			this._get
		);

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
		const response = await this._tryRequest(this.getURL('accounts/'), {
			searchParams: new URLSearchParams([
				['suggest', ''],
				['q', query],
				['n', maxCount.toString()],
			]),
			...this._get,
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

	public async getGroups(): Promise<GerritGroup[]> {
		const response = await this._tryRequest(
			this.getURL('groups/'),
			this._get
		);

		const json = this._handleResponse<GerritGroupsResponse>(response);
		if (!json) {
			return [];
		}

		const groups = Object.entries(json).map(
			([groupName, groupJson]) => new GerritGroup(groupName, groupJson)
		);
		GerritAPI._groups = groups;
		return groups;
	}

	public async getGroupsCached(): Promise<GerritGroup[]> {
		if (GerritAPI._groups) {
			return GerritAPI._groups;
		}

		return this.getGroups();
	}

	public async getProjects(): Promise<GerritProject[]> {
		const response = await this._tryRequest(this.getURL('projects/'), {
			searchParams: new URLSearchParams([['d', '']]),
			...this._get,
		});

		const json = this._handleResponse<GerritProjectsResponse>(response);
		if (!json) {
			return [];
		}

		const projects = Object.entries(json).map(
			([projectName, projectJson]) =>
				new GerritProject(projectName, projectJson)
		);
		GerritAPI._projects = projects;
		return projects;
	}

	public async getProjectsCached(): Promise<GerritProject[]> {
		if (GerritAPI._projects) {
			return GerritAPI._projects;
		}

		return this.getProjects();
	}

	public async getChangeDetail(
		changeID: string
	): Promise<GerritChangeDetail | null> {
		const response = await this._tryRequest(
			this.getURL(`changes/${changeID}/detail/`),
			this._get
		);

		const json = this._handleResponse<GerritChangeDetailResponse>(response);
		if (!json) {
			return null;
		}

		return new GerritChangeDetail(json);
	}

	public async suggestReviewers(
		changeID: string,
		query?: string,
		maxCount: number = 10
	): Promise<(GerritUser | GerritGroup)[]> {
		if (
			GerritAPI._reviewerSuggestionCache.has(changeID) &&
			GerritAPI._reviewerSuggestionCache.get(changeID)!.has(query)
		) {
			return GerritAPI._reviewerSuggestionCache
				.get(changeID)!
				.get(query)!;
		}

		const suggestions = await this._suggestPersonShared(
			changeID,
			query,
			maxCount
		);
		if (!GerritAPI._reviewerSuggestionCache.has(changeID)) {
			GerritAPI._reviewerSuggestionCache.set(changeID, new Map());
		}
		GerritAPI._reviewerSuggestionCache
			.get(changeID)!
			.set(query, suggestions);
		return suggestions;
	}

	public async suggestCC(
		changeID: string,
		query?: string,
		maxCount: number = 10
	): Promise<(GerritUser | GerritGroup)[]> {
		if (
			GerritAPI._ccSuggestionCache.has(changeID) &&
			GerritAPI._ccSuggestionCache.get(changeID)!.has(query)
		) {
			return GerritAPI._ccSuggestionCache.get(changeID)!.get(query)!;
		}

		const suggestions = await this._suggestPersonShared(
			changeID,
			query,
			maxCount,
			['reviewer-state', 'CC']
		);
		if (!GerritAPI._ccSuggestionCache.has(changeID)) {
			GerritAPI._ccSuggestionCache.set(changeID, new Map());
		}
		GerritAPI._ccSuggestionCache.get(changeID)!.set(query, suggestions);
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
		// TODO: join requests
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

		const response = await this._tryRequest(
			this.getURL(`changes/${changeID}/revisions/${revisionID}/review`),
			{
				...this._post,
				body: JSON.stringify(
					optionalObjectProperty({
						labels: options.labels,
						comments: options.message
							? {
									[PATCHSET_LEVEL_KEY]: [
										{
											message: options.message,
											unresolved: !(
												options.resolved ?? true
											),
										},
									],
							  }
							: undefined,
						drafts: options.publishDrafts
							? 'PUBLISH_ALL_REVISIONS'
							: 'KEEP',
						remove_from_attention_set: changes.removed.map(
							(id) => ({
								user: id,
								reason: `${self.getName(
									true
								)} replied to the change`,
							})
						),
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
						ready: true,
					})
				),
			}
		);

		const json = this._handleResponse<Record<string, unknown>>(response);
		if (!json) {
			return false;
		}

		return true;
	}
}
