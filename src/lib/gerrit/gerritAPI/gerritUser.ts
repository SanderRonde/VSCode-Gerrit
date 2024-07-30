import { GerritDetailedUserResponse } from './types';
import { getAPIForRepo } from '../gerritAPI';
import { GerritRepo } from '../gerritRepo';
import { Data } from '../../util/data';

export class GerritUser {
	private static _self: GerritUser | null = null;

	public accountID: number;
	public name: string | undefined;
	public displayName: string | undefined;
	public email: string | undefined;
	public username: string | undefined;
	public hasMore: boolean;

	public constructor(
		response: GerritDetailedUserResponse,
		private readonly _gerritReposD: Data<GerritRepo[]>
	) {
		this.accountID = response._account_id;
		this.name = response.name;
		this.displayName = response.display_name;
		this.email = response.email;
		this.username = response.username;

		this.hasMore = response._more_accounts ?? false;
	}

	public static async getSelf(
		gerritReposD: Data<GerritRepo[]>,
		gerritRepo: GerritRepo
	): Promise<GerritUser | null> {
		if (this._self) {
			return this._self;
		}
		const api = await getAPIForRepo(gerritReposD, gerritRepo);
		if (!api) {
			return null;
		}
		return (this._self = await api.getSelf());
	}

	public static async isSelf(
		gerritReposD: Data<GerritRepo[]>,
		gerritRepo: GerritRepo,
		accountID: number
	): Promise<boolean> {
		const self = await GerritUser.getSelf(gerritReposD, gerritRepo);
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

	public async isSelf(gerritRepo: GerritRepo): Promise<boolean> {
		const self = await GerritUser.getSelf(this._gerritReposD, gerritRepo);
		if (!self) {
			return false;
		}

		return self.accountID === this.accountID;
	}
}
