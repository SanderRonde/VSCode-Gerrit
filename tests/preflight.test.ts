import * as assert from 'assert';
import {
	runPreflight,
	PreflightDeps,
	PreflightError,
} from '../src/lib/ai-review/preflight';
import {
	buildMcpEnableCommand,
} from '../src/lib/ai-review/agentCli';

function makeDeps(
	overrides: Partial<PreflightDeps> = {}
): PreflightDeps {
	return {
		whichCmd: overrides.whichCmd
			?? (async (_name: string) => false),
		getNodeMajor: overrides.getNodeMajor
			?? (() => 20),
	};
}

describe('runPreflight', () => {
	it('throws when Node < 18', async () => {
		const deps = makeDeps({
			getNodeMajor: () => 16,
		});

		await assert.rejects(
			() => runPreflight(deps),
			(err: Error) => {
				assert.ok(
					err instanceof PreflightError
				);
				assert.strictEqual(
					(err as PreflightError)
						.recoverable,
					false
				);
				assert.ok(
					err.message.includes(
						'Node.js >= 18'
					)
				);
				return true;
			}
		);
	});

	it('throws when Node is exactly 17', async () => {
		const deps = makeDeps({
			getNodeMajor: () => 17,
		});

		await assert.rejects(
			() => runPreflight(deps),
			(err: Error) => {
				assert.ok(
					err instanceof PreflightError
				);
				assert.strictEqual(
					(err as PreflightError)
						.recoverable,
					false
				);
				assert.ok(
					err.message.includes('v17')
				);
				return true;
			}
		);
	});

	it('succeeds with Node 18', async () => {
		const deps = makeDeps({
			getNodeMajor: () => 18,
			whichCmd: async (name: string) =>
				name === 'agent',
		});
		const status = await runPreflight(deps);

		assert.strictEqual(status.nodeOk, true);
		assert.strictEqual(status.nodeMajor, 18);
		assert.strictEqual(status.cliFound, true);
		assert.strictEqual(
			status.agent.cmd, 'agent'
		);
	});

	it(
		'prefers standalone agent CLI when available',
		async () => {
			const deps = makeDeps({
				whichCmd: async (_name: string) =>
					true,
			});
			const status = await runPreflight(deps);

			assert.strictEqual(
				status.nodeOk, true
			);
			assert.strictEqual(
				status.cliFound, true
			);
			assert.strictEqual(
				status.agent.cmd, 'agent'
			);
			assert.deepStrictEqual(
				status.agent.baseArgs, []
			);
		}
	);

	it(
		'falls back to cursor agent when agent is '
		+ 'not found',
		async () => {
			const deps = makeDeps({
				whichCmd: async (name: string) =>
					name === 'cursor',
			});
			const status = await runPreflight(deps);

			assert.strictEqual(
				status.cliFound, true
			);
			assert.strictEqual(
				status.agent.cmd, 'cursor'
			);
			assert.deepStrictEqual(
				status.agent.baseArgs, ['agent']
			);
		}
	);

	it(
		'throws when neither agent nor cursor '
		+ 'are available',
		async () => {
			const deps = makeDeps({
				whichCmd: async (_name: string) =>
					false,
			});

			await assert.rejects(
				() => runPreflight(deps),
				(err: Error) => {
					assert.ok(
						err instanceof PreflightError
					);
					assert.strictEqual(
						(err as PreflightError)
							.recoverable,
						true
					);
					assert.ok(
						err.message.includes(
							'Cursor Agent CLI not found'
						)
					);
					assert.ok(
						err.message.includes(
							'cursor.com/install'
						)
					);
					return true;
				}
			);
		}
	);

	it(
		'checks Node version before CLI detection',
		async () => {
			const whichNames: string[] = [];
			const deps: PreflightDeps = {
				getNodeMajor: () => 14,
				whichCmd: async (name: string) => {
					whichNames.push(name);
					return false;
				},
			};

			await assert.rejects(
				() => runPreflight(deps)
			);
			assert.ok(
				!whichNames.includes('agent'),
				'should not probe for agent CLI'
			);
			assert.ok(
				!whichNames.includes('cursor'),
				'should not probe for cursor CLI'
			);
		}
	);
});

describe('buildMcpEnableCommand', () => {
	it('builds command for standalone agent', () => {
		const cmd = buildMcpEnableCommand(
			{ cmd: 'agent', baseArgs: [] },
			'gerrit-review'
		);
		assert.strictEqual(
			cmd,
			'agent mcp enable gerrit-review'
		);
	});

	it('builds command for cursor agent fallback', () => {
		const cmd = buildMcpEnableCommand(
			{
				cmd: 'cursor',
				baseArgs: ['agent'],
			},
			'gerrit-review'
		);
		assert.strictEqual(
			cmd,
			'cursor agent mcp enable gerrit-review'
		);
	});
});
