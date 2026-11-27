import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	buildTree,
	type CliCommand,
	type CliGroup,
	type CommandNode,
	camelToKebab,
	type GenericBuilderInternals,
	generateSchema,
	type ProcessedBuilderConfig,
	type SchemaCommand,
	type SchemaOption,
} from "@superset/cli-framework";
import { Glob } from "bun";
import config from "../cli.config";

export const BASELINE_PATH = resolve(
	import.meta.dir,
	"../test/surface/baseline.json",
);
export const REGENERATE_COMMAND =
	"bun packages/cli/scripts/cli-surface.ts --write";

const COMMANDS_DIR = resolve(import.meta.dir, "../src/commands");
const REPO_ROOT = resolve(import.meta.dir, "../../..");

export interface SurfaceOption {
	name: string;
	aliases: string[];
	type: SchemaOption["type"];
	required: boolean;
	default?: unknown;
	enum?: string[];
	variadic?: true;
	int?: true;
	env?: string;
	hidden?: true;
}

export interface SurfaceArg {
	name: string;
	required: boolean;
	enum?: string[];
	variadic?: true;
}

export interface SurfaceCommand {
	aliases?: string[];
	hidden?: true;
	audience?: "internal";
	sandbox?: false;
	options: SurfaceOption[];
	args: SurfaceArg[];
}

export interface CliSurface {
	globalOptions: SurfaceOption[];
	commands: Record<string, SurfaceCommand>;
}

async function loadTree(): Promise<{
	commands: CliCommand[];
	groups: CliGroup[];
}> {
	const scan = (pattern: string) =>
		Array.from(
			new Glob(pattern).scanSync({ cwd: COMMANDS_DIR, onlyFiles: true }),
		).sort();
	const pathOf = (file: string) => file.split("/").slice(0, -1);

	const commands = await Promise.all(
		scan("**/command.ts").map(async (file) => ({
			path: pathOf(file),
			command: (
				(await import(`${COMMANDS_DIR}/${file}`)) as {
					default: CliCommand["command"];
				}
			).default,
		})),
	);
	const groups = await Promise.all(
		scan("**/meta.ts").map(async (file) => ({
			path: pathOf(file),
			...(
				(await import(`${COMMANDS_DIR}/${file}`)) as {
					default: Omit<CliGroup, "path">;
				}
			).default,
		})),
	);
	return { commands, groups };
}

function processed(
	builders: Record<string, GenericBuilderInternals> | undefined,
): Record<string, ProcessedBuilderConfig> {
	return Object.fromEntries(
		Object.entries(builders ?? {}).map(([key, builder]) => [
			key,
			{ ...builder._.config, name: builder._.config.name ?? camelToKebab(key) },
		]),
	);
}

function nodeAt(root: CommandNode, path: string[]): CommandNode | undefined {
	let node: CommandNode | undefined = root;
	for (const segment of path) node = node?.children.get(segment);
	return node;
}

function toSurfaceOption(option: SchemaOption): SurfaceOption {
	const {
		description: _description,
		min: _min,
		max: _max,
		conflicts: _conflicts,
		...surface
	} = option;
	return surface;
}

function flatten(
	command: SchemaCommand,
	declared: Map<string, Pick<SurfaceCommand, "audience" | "sandbox">>,
	out: Record<string, SurfaceCommand>,
): void {
	const key = command.path.join(" ");
	out[key] = {
		...(command.aliases && { aliases: command.aliases }),
		...(command.hidden && { hidden: true }),
		...declared.get(key),
		options: command.options.map(toSurfaceOption),
		args: command.args.map(({ description: _description, ...arg }) => arg),
	};
	for (const child of command.commands) flatten(child, declared, out);
}

/** Every command, hidden and internal included, as no audience or sandbox filter sees it. */
export async function buildSurface(): Promise<CliSurface> {
	const { commands, groups } = await loadTree();
	const { root, commandMap } = buildTree(groups, commands);
	root.options = processed(config.globals);
	for (const [key, command] of commandMap) {
		const node = nodeAt(root, key.split("/"));
		if (!node) continue;
		node.options = processed(command.options);
		node.args = (command.args as GenericBuilderInternals[] | undefined)?.map(
			(builder) => ({
				...builder._.config,
				name: builder._.config.name ?? "arg",
			}),
		);
	}

	const declared = new Map<
		string,
		Pick<SurfaceCommand, "audience" | "sandbox">
	>();
	for (const { path, audience, sandbox } of [
		...groups,
		...commands.map(({ path, command }) => ({ path, ...command })),
	]) {
		if (audience !== "internal" && sandbox !== false) continue;
		declared.set(path.join(" "), {
			...declared.get(path.join(" ")),
			...(audience === "internal" && { audience }),
			...(sandbox === false && { sandbox }),
		});
	}

	const schema = generateSchema(
		{ name: config.name, version: config.version, root },
		{ includeHidden: true },
	);
	const flat: Record<string, SurfaceCommand> = {};
	for (const command of schema.commands) flatten(command, declared, flat);
	return {
		globalOptions: schema.globalOptions.map(toSurfaceOption),
		commands: Object.fromEntries(
			Object.entries(flat).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
		),
	};
}

/** Writes `value` as JSON in the repo's Biome format, so `bun run lint` accepts the file. */
export function writeFormattedJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
	const biome = Bun.spawnSync(["bunx", "biome", "format", "--write", path], {
		cwd: REPO_ROOT,
		stdout: "ignore",
	});
	if (biome.exitCode !== 0) {
		throw new Error(`biome format failed: ${biome.stderr.toString()}`);
	}
}

if (import.meta.main) {
	const surface = await buildSurface();
	if (process.argv.includes("--write")) {
		writeFormattedJson(BASELINE_PATH, surface);
		console.error(`Wrote ${BASELINE_PATH}`);
	} else {
		process.stdout.write(`${JSON.stringify(surface, null, "\t")}\n`);
	}
}
