export class UserCancelledError extends Error {
	public readonly stepName: string | undefined;

	public constructor(stepName?: string) {
		super('Operation cancelled.');
		this.name = 'UserCancelledError';
		this.stepName = stepName;
	}
}

export function isUserCancelledError(
	error: unknown
): error is UserCancelledError {
	return error instanceof UserCancelledError;
}
