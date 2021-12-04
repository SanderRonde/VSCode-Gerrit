import { GerritGroupResponse } from './types';
import { DateTime } from '../dateTime';

export class GerritGroup {
	public id: string;
	public url: string;
	public options: Record<string, unknown>;
	public description: string;
	public groupId: number;
	public owner: string;
	public ownerId: string;
	public createdOn: DateTime;

	public constructor(public name: string, response: GerritGroupResponse) {
		this.id = response.id;
		this.url = response.url;
		this.options = response.options;
		this.description = response.description;
		this.groupId = response.group_id;
		this.owner = response.owner;
		this.ownerId = response.owner_id;
		this.createdOn = new DateTime(response.created_on);
	}
}
