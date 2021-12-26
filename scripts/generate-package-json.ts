/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { COMMAND_DEFINITIONS, VIEWS } from '../src/commands/defs';
import { optionalObjectProperty } from '../src/lib/util/util';
import * as fs from 'fs-extra';
import * as path from 'path';

interface Package {
	activationEvents: string[];
	contributes: {
		commands: {
			command: string;
			title: string;
			enablement?: string;
			icon?:
				| string
				| {
						dark: string;
						light: string;
				  };
		}[];
		keybindings: {
			command: string;
			when?: string;
		}[];
		menus: {
			[menuName: string]: (
				| {
						command: string;
						when?: string;
						group?: string;
				  }
				| {
						submenu: string;
						when?: string;
						group?: string;
				  }
			)[];
		};
	};
}

async function readPackageJSON(): Promise<Package> {
	const packagePath = path.join(__dirname, '../package.json');
	return (await fs.readJSON(packagePath)) as Package;
}

async function writePackageJSON(pkg: Package): Promise<void> {
	const packagePath = path.join(__dirname, '../package.json');
	await fs.writeJSON(packagePath, pkg, {
		encoding: 'utf8',
		spaces: 4,
	});
}

async function generatePackageJSON(): Promise<void> {
	const commands = Object.entries(COMMAND_DEFINITIONS);
	const packageJSON = await readPackageJSON();

	const newPackageJSON: Package = {
		...packageJSON,
		activationEvents: [
			...packageJSON.activationEvents.filter(
				(e) => !e.startsWith('onCommand:gerrit')
			),
			...commands.map(([command]) => `onCommand:gerrit.${command}`),
		],
		contributes: {
			...packageJSON.contributes,
			commands: commands.map(([command, commandConfig]) => {
				return {
					command,
					title: commandConfig.title,
					...optionalObjectProperty({
						icon: commandConfig.icon,
						enablement: commandConfig.enablement,
					}),
				};
			}),
			keybindings: commands
				.filter(([, config]) => config.keybinding)
				.map(([command, config]) => {
					return {
						command,
						when:
							config.keybinding === true
								? 'true'
								: config.keybinding!,
					};
				}),
			menus: {
				...packageJSON.contributes.menus,
				commandPalette: commands.map(([command, config]) => {
					return {
						command,
						when: config.inCommandPalette ? 'true' : 'false',
					};
				}),
				...Object.fromEntries(
					Object.entries(VIEWS).map(([view, viewConfig]) => {
						const viewEntries: (
							| {
									command: string;
									when?: string;
									group?: string;
							  }
							| {
									submenu: string;
									when?: string;
									group?: string;
							  }
						)[] = [];
						for (const groupName in viewConfig) {
							const groupEntries = viewConfig[groupName];
							for (let i = 0; i < groupEntries.length; i++) {
								const entry = groupEntries[i];
								if ('command' in entry) {
									viewEntries.push({
										command: entry.command,
										...optionalObjectProperty({
											when: entry.when,
										}),
										group: `${groupName}@${i + 1}`,
									});
								} else {
									viewEntries.push({
										submenu: entry.submenu,
										...optionalObjectProperty({
											when: entry.when,
										}),
										group: `${groupName}@${i + 1}`,
									});
								}
							}
						}

						return [view, viewEntries];
					})
				),
			},
		},
	};

	await writePackageJSON(newPackageJSON);
}

async function validatePackageJSON(): Promise<void> {
	const packageJSON = await readPackageJSON();

	if (
		!packageJSON.contributes.commands.every(
			(c) => c.command in COMMAND_DEFINITIONS
		)
	) {
		throw new Error(
			`contributes.commands contains unknown command: ${packageJSON.contributes.commands
				.map((c) => c.command)
				.filter((c) => !(c in COMMAND_DEFINITIONS))
				.join(', ')}`
		);
	}

	if (
		!packageJSON.contributes.keybindings.every(
			(k) => k.command in COMMAND_DEFINITIONS
		)
	) {
		throw new Error(
			`contributes.keybindings contains unknown command: ${packageJSON.contributes.keybindings
				.map((k) => k.command)
				.filter((c) => !(c in COMMAND_DEFINITIONS))
				.join(', ')}`
		);
	}

	if (
		!packageJSON.contributes.menus.commandPalette.every(
			(c) => !('command' in c) || c.command in COMMAND_DEFINITIONS
		)
	) {
		throw new Error(
			`contributes.menus.commandPalette contains unknown command: ${packageJSON.contributes.menus.commandPalette.map(
				(c) => !('command' in c) || c.command
			)}`
		);
	}

	const packageString = JSON.stringify(packageJSON);
	for (const command in COMMAND_DEFINITIONS) {
		if (!packageString.includes(command)) {
			throw new Error(`Found unused command: "${command}"`);
		}
	}
}

void (async () => {
	let ranCommands = 0;
	if (process.argv.includes('--generate')) {
		await generatePackageJSON();
		ranCommands += 1;
	}
	if (process.argv.includes('--validate')) {
		await validatePackageJSON();
		ranCommands += 1;
	}

	if (!ranCommands) {
		throw new Error('No command specified, use --generate or --validate');
	}
})();
