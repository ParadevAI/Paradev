import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type LoadedConfig, loadConfig } from "./config";
import { createCommandsPlugin } from "./plugin";

export function buildOptions({
	config,
	configPath,
	root,
}: LoadedConfig): Pick<Bun.BuildConfig, "entrypoints" | "plugins" | "define"> {
	const commandsDir = resolve(root, config.commandsDir);
	const cacheDir = resolve(root, "node_modules/.cache/cli-framework");
	mkdirSync(cacheDir, { recursive: true });
	const entryPath = resolve(cacheDir, "entry.ts");
	writeFileSync(
		entryPath,
		`import config from ${JSON.stringify(configPath)};
import { commands, groups, middleware } from ${JSON.stringify(`${commandsDir}/index.ts`)};
import { run } from "@superset/cli-framework";

await run({
	name: config.name,
	version: config.version,
	tree: { commands, groups, middleware },
	globals: config.globals,
	help: config.help,
	audiences: config.audiences?.(),
	sandbox: config.sandbox?.(),
});
`,
	);

	return {
		entrypoints: [entryPath],
		plugins: [createCommandsPlugin({ commandsDir }), ...(config.plugins ?? [])],
		define: config.define,
	};
}

export async function runBuild(argv: string[]): Promise<void> {
	const loaded = await loadConfig(process.cwd());
	const { config, root } = loaded;

	let target: Bun.Build.CompileTarget | undefined;
	let outfile = resolve(root, config.outfile ?? `./dist/${config.name}`);
	for (const arg of argv) {
		if (arg.startsWith("--target=")) {
			target = arg.slice("--target=".length) as Bun.Build.CompileTarget;
		} else if (arg.startsWith("--outfile=")) {
			outfile = resolve(root, arg.slice("--outfile=".length));
		}
	}

	const result = await Bun.build({
		...buildOptions(loaded),
		compile: target ? { target, outfile } : { outfile },
	});

	if (!result.success) {
		for (const log of result.logs) console.error(log);
		process.exit(1);
	}
	console.log(`[cli-framework] wrote ${outfile}`);
}
