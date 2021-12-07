import { GerritDetailedUserResponse } from './types';
import { getAPI } from '../gerritAPI';

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

	public static async isSelf(accountID: number): Promise<boolean> {
		const self = await GerritUser.getSelf();
		if (!self) {
			return false;
		}

		return self.accountID === accountID;
	}

	public getName(useFallback: true): string;
	public getName(useFallback?: false): string | null;
	public getName(useFallback: boolean = false): string | null {
		return (
			(this.displayName || this.name || this.username || this.email) ??
			(useFallback ? '' : null)
		);
	}

	public shortName(): string {
		if (this.name && this.name.split(' ').length === 2) {
			const [firstName, lastName] = this.name.split(' ');
			return firstName.slice(0, 1) + lastName.slice(0, 1);
		}
		return this.getName(true).slice(0, 2);
	}

	public async isSelf(): Promise<boolean> {
		const self = await GerritUser.getSelf();
		if (!self) {
			return false;
		}

		return self.accountID === this.accountID;
	}
}
