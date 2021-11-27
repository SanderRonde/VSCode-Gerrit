import { GerritDetailedUserResponse, GerritUserResponse } from './types';
import { DynamicallyFetchable } from './shared';
import { getAPI } from '../gerritAPI';

export class GerritUser {
	public accountId: number;
	public name: string | undefined;
	public displayName: string | undefined;
	public email: string | undefined;
	public username: string | undefined;

	constructor(response: GerritDetailedUserResponse) {
		this.accountId = response._account_id;
		this.name = response.name;
		this.displayName = response.display_name;
		this.email = response.email;
		this.username = response.username;
	}

	getName() {
		return (
			(this.displayName || this.name || this.username || this.email) ??
			null
		);
	}

	static _self: GerritUser | null = null;
	static async getSelf() {
		if (this._self) {
			return this._self;
		}
		const api = getAPI();
		if (!api) {
			return null;
		}
		return (this._self = await api.getSelf());
	}
}
