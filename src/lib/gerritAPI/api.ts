import {
	GerritChangeResponse,
	GerritCommentRange,
	GerritCommentResponse,
	GerritCommentSide,
	GerritCommentsResponse,
	GerritDetailedUserResponse,
} from './types';
import { FileCache } from '../../views/activityBar/changes/changeTreeView/file/fileCache';
import got, { OptionsOfTextResponseBody, Response } from 'got/dist/source';
import { DefaultChangeFilter, GerritChangeFilter } from './filters';
import { GerritComment, GerritDraftComment } from './gerritComment';
import { getChangeCache } from '../gerritCache';
import { GerritChange } from './gerritChange';
import { READONLY_MODE } from '../constants';
import { TextContent } from './gerritFile';
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

export class GerritAPI {
	private readonly _MAGIC_PREFIX = ")]}'";

	public constructor(
		private _url: string,
		private _username: string,
		private _password: string
	) {}

	private get _headers(): Record<string, string> {
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

	private get _put(): OptionsOfTextResponseBody {
		return {
			method: 'PUT',
			headers: this._headers,
		};
	}

	private _getURL(path: string): string {
		return `${this._url}/a/${path}`;
	}

	private _stripMagicPrefix(body: string): string {
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
			if (READONLY_MODE && body?.method !== 'GET') {
				throw new Error('Trying to modify data in readonly mode');
			}
			const response = (await got(url, body)) as ResponseWithBody<string>;
			response.strippedBody = this._stripMagicPrefix(response.body);
			return response;
		} catch (e) {
			await window.showErrorMessage(
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

	public async testConnection(): Promise<boolean> {
		const response = await this._tryRequest(
			this._getURL('config/server/version'),
			this._get
		);
		return response?.statusCode === 200;
	}

	public async getChange(
		changeId: string,
		...withValues: never[]
	): Promise<GerritChange | null>;
	public async getChange(
		changeId: string,
		...withValues: GerritAPIWith.LABELS[]
	): Promise<InstanceType<WithValue<typeof GerritChange, 'labels'>> | null>;
	public async getChange(
		changeId: string,
		...withValues: GerritAPIWith.DETAILED_LABELS[]
	): Promise<InstanceType<
		WithValue<typeof GerritChange, 'detailedLabels'>
	> | null>;
	public async getChange(
		changeId: string,
		...withValues: GerritAPIWith[]
	): Promise<GerritChange | null>;
	public async getChange(
		changeId: string,
		...withValues: GerritAPIWith[]
	): Promise<GerritChange | null> {
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

	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: never[]
	): Promise<GerritChange[]>;
	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith.LABELS[]
	): Promise<InstanceType<WithValue<typeof GerritChange, 'labels'>>[]>;
	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith.DETAILED_LABELS[]
	): Promise<
		InstanceType<WithValue<typeof GerritChange, 'detailedLabels'>>[]
	>;
	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith[]
	): Promise<GerritChange[]>;
	public async getChanges(
		filters: (DefaultChangeFilter | GerritChangeFilter)[][],
		...withValues: GerritAPIWith[]
	): Promise<GerritChange[]> {
		const response = await this._tryRequest(this._getURL('changes/'), {
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

	private async _getCommentsShared(
		changeId: string,
		type: 'drafts' | 'comments'
	): Promise<GerritCommentsResponse | null> {
		const response = await this._tryRequest(
			this._getURL(`changes/${changeId}/${type}/`),
			this._get
		);

		if (!response || response.statusCode !== 200) {
			return null;
		}

		const json = this._tryParseJSON<GerritCommentsResponse>(
			response.strippedBody
		);
		if (!json) {
			return null;
		}

		return json;
	}

	public async getComments(
		changeId: string
	): Promise<Map<string, GerritComment[]>> {
		const json = await this._getCommentsShared(changeId, 'comments');
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
						GerritComment.from(changeId, filePath, c)
					)
				)
			);
		}
		return map;
	}

	public async getDraftComments(
		changeId: string
	): Promise<Map<string, GerritDraftComment[]>> {
		const json = await this._getCommentsShared(changeId, 'drafts');
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
						GerritDraftComment.from(changeId, filePath, c)
					)
				)
			);
		}
		return map;
	}

	public async getFileContent(
		project: string,
		commit: string,
		changeId: string,
		filePath: string
	): Promise<TextContent | null> {
		if (FileCache.has(project, commit, filePath)) {
			return FileCache.get(project, commit, filePath);
		}

		const response = await this._tryRequest(
			this._getURL(
				`projects/${project}/commits/${commit}/files/${encodeURIComponent(
					filePath
				)}/content`
			),
			this._get
		);

		if (!response || response.statusCode !== 200) {
			return null;
		}

		const textContent = TextContent.from(
			{
				project,
				commit,
				filePath,
				changeId,
			},
			response.body,
			'base64'
		);
		if (!textContent) {
			return null;
		}

		FileCache.set(project, commit, filePath, textContent);
		return textContent;
	}

	public async createDraftComment(
		content: string,
		changeId: string,
		revision: string,
		filePath: string,
		unresolved: boolean,
		side: GerritCommentSide,
		lineOrRange?: number | GerritCommentRange,
		replyTo?: string
	): Promise<GerritComment | null> {
		const response = await this._tryRequest(
			this._getURL(
				`changes/${changeId}/revisions/${revision}/drafts/${encodeURIComponent(
					filePath
				)}/content`
			),
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

		if (!response || response.statusCode !== 200) {
			return null;
		}

		const json = this._tryParseJSON<GerritCommentResponse>(
			response.strippedBody
		);
		if (!json) {
			return null;
		}

		return GerritComment.from(changeId, filePath, json);
	}

	public async getSelf(): Promise<GerritUser | null> {
		const response = await this._tryRequest(
			this._getURL('accounts/self'),
			this._get
		);

		if (!response || response.statusCode !== 200) {
			return null;
		}

		const json = this._tryParseJSON<GerritDetailedUserResponse>(
			response.strippedBody
		);
		if (!json) {
			return null;
		}

		return new GerritUser(json);
	}
}
