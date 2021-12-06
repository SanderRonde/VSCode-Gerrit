export interface ChangeState {
	// Bit confusing I know
	number: string;
}

export type ReviewWebviewState = Partial<{
	currentChange: string | undefined;
	changes: Record<string, ChangeState>;
}>;
