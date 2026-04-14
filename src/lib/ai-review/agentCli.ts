export interface AgentCommand {
	cmd: string;
	baseArgs: string[];
}

export function buildMcpEnableCommand(
	agent: AgentCommand,
	serverName: string
): string {
	const parts = [
		agent.cmd, ...agent.baseArgs,
		'mcp', 'enable', serverName,
	];
	return parts.join(' ');
}

export function buildStatusCommand(
	agent: AgentCommand
): string {
	return [
		agent.cmd, ...agent.baseArgs, 'status',
	].join(' ');
}

export function buildLoginCommand(
	agent: AgentCommand
): string {
	return [
		agent.cmd, ...agent.baseArgs, 'login',
	].join(' ');
}
