import { GerritGroupBaseInfo, GerritGroupResponse } from './types';
import { DateTime } from '../../util/dateTime';

export class GerritGroup {
	public id: string;
	public url?: string;
	public options?: Record<string, unknown>;
	public description?: string;
	public groupId?: number;
	public owner?: string;
	public ownerId?: string;
	public createdOn?: DateTime;

	public constructor(
		public name: string,
		response: Omit<GerritGroupBaseInfo, 'name'> &
			Partial<GerritGroupResponse>
	) {
		this.id = response.id;
		this.url = response.url;
		this.options = response.options;
		this.description = response.description;
		this.groupId = response.group_id;
		this.owner = response.owner;
		this.ownerId = response.owner_id;
		this.createdOn = response.created_on
			? new DateTime(response.created_on)
			: undefined;
	}

	public shortName(): string {
		return this.name.slice(0, 2);
	}
}
