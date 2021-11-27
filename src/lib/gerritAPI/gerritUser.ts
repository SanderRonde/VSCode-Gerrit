import { GerritDetailedUserResponse } from './types';
import { getAPI } from '../gerritAPI';

export class GerritUser {
	public accountId: number;
	public name: string | undefined;
	public displayName: string | undefined;
	public email: string | undefined;
	public username: string | undefined;

	public constructor(response: GerritDetailedUserResponse) {
		this.accountId = response._account_id;
		this.name = response.name;
		this.displayName = response.display_name;
		this.email = response.email;
		this.username = response.username;
	}

	public getName(useFallback: true): string;
	public getName(useFallback?: false): string | null;
	public getName(useFallback: boolean = false): string | null {
		return (
			(this.displayName || this.name || this.username || this.email) ??
			(useFallback ? '' : null)
		);
	}

	private static _self: GerritUser | null = null;
	public static async getSelf(): Promise<GerritUser | null> {
		if (this._self) {
			return this._self;
		}
		const api = await getAPI();
		if (!api) {
			return null;
		}
		return (this._self = await api.getSelf());
	}
}
