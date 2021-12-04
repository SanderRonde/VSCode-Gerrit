import { GerritDetailedUserResponse } from './types';
import { getAPI } from '.';

export class GerritUser {
	private static _self: GerritUser | null = null;

	public accountID: number;
	public name: string | undefined;
	public displayName: string | undefined;
	public email: string | undefined;
	public username: string | undefined;
	public hasMore: boolean;

	public constructor(response: GerritDetailedUserResponse) {
		this.accountID = response._account_id;
		this.name = response.name;
		this.displayName = response.display_name;
		this.email = response.email;
		this.username = response.username;

		this.hasMore = response._more_accounts ?? false;
	}

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

	public getName(useFallback: true): string;
	public getName(useFallback?: false): string | null;
	public getName(useFallback: boolean = false): string | null {
		return (
			(this.displayName || this.name || this.username || this.email) ??
			(useFallback ? '' : null)
		);
	}
}
