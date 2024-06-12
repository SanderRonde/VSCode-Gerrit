import { GerritProjectResponse } from './types';

export class GerritProject {
	public id: string;
	public description: string;

	public constructor(
		public name: string,
		response: GerritProjectResponse
	) {
		this.id = response.id;
		this.description = response.description;
	}
}
