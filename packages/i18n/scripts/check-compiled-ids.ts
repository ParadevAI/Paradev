import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { transformAsync } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";

// Next runs React Compiler before the Lingui SWC macro. The compiler can move
// a <Trans> child or a t`` value into a memo temp, so the build emits a message
// (and id) that `lingui extract` never saw, and the page shows the raw id.
// This builds each macro file both ways with the app's own Next and plugin.

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const MACRO_IMPORT = /from "@lingui\/(react|core)\/macro"/;
const SKIPPED_FILE = /\.(test|spec|stories)\.tsx?$/;

interface SwcBindings {
	loadBindings(): Promise<unknown>;
	transform(
		code: string,
		options: Record<string, unknown>,
	): Promise<{ code: string }>;
}

function compilerApps(): string[] {
	const appsDir = join(REPO_ROOT, "apps");
	return readdirSync(appsDir).filter((app) => {
		let config: string;
		try {
			config = readFileSync(
				join(appsDir, app, "next.config.ts"),
				"utf8",
			).replace(/^\s*\/\/.*$/gm, "");
		} catch {
			return false;
		}
		const setting = config.match(/reactCompiler:\s*([^,\n]+)/)?.[1]?.trim();
		if (!setting || setting === "false") return false;
		if (setting !== "true") {
			throw new Error(
				`apps/${app}/next.config.ts sets reactCompiler to ${setting}; teach scripts/check-compiled-ids.ts to pass those options.`,
			);
		}
		return config.includes("@lingui/swc-plugin");
	});
}

function readManifest(dir: string): {
	name?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
} {
	return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

function workspacePackages(): Map<string, string> {
	const packagesDir = join(REPO_ROOT, "packages");
	const byName = new Map<string, string>();
	for (const entry of readdirSync(packagesDir)) {
		const dir = join(packagesDir, entry);
		if (!existsSync(join(dir, "package.json"))) continue;
		const { name } = readManifest(dir);
		if (name) byName.set(name, dir);
	}
	return byName;
}

// The app's own source plus every workspace package it builds, transitively.
function sourceRoots(appDir: string, packages: Map<string, string>): string[] {
	const seen = new Set<string>([appDir]);
	const queue = [appDir];
	for (const dir of queue) {
		const { dependencies = {}, devDependencies = {} } = readManifest(dir);
		for (const [name, version] of Object.entries({
			...dependencies,
			...devDependencies,
		})) {
			const packageDir = packages.get(name);
			if (!version.startsWith("workspace:") || !packageDir) continue;
			if (seen.has(packageDir)) continue;
			seen.add(packageDir);
			queue.push(packageDir);
		}
	}
	return [...seen]
		.map((dir) => join(dir, "src"))
		.filter((dir) => existsSync(dir));
}

function macroFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules") continue;
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			files.push(...macroFiles(path));
		} else if (/\.tsx?$/.test(entry) && !SKIPPED_FILE.test(entry)) {
			if (MACRO_IMPORT.test(readFileSync(path, "utf8"))) files.push(path);
		}
	}
	return files;
}

function descriptors(code: string): Map<string, string> {
	const found = new Map<string, string>();
	const ids = [...code.matchAll(/\bid: "([^"]+)"/g)];
	ids.forEach((match, index) => {
		const rest = code.slice(match.index, ids[index + 1]?.index);
		const message = rest.match(/\bmessage: ("(?:[^"\\]|\\.)*")/)?.[1];
		found.set(match[1], message ?? "");
	});
	return found;
}

async function checkApp(
	app: string,
	packages: Map<string, string>,
): Promise<{ problems: string[]; files: number }> {
	const appDir = join(REPO_ROOT, "apps", app);
	const appRequire = createRequire(join(appDir, "package.json"));
	const swc = appRequire("next/dist/build/swc/index.js") as SwcBindings;
	await swc.loadBindings();
	const linguiPlugin = appRequire.resolve("@lingui/swc-plugin");

	const problems: string[] = [];
	const files = sourceRoots(appDir, packages).flatMap(macroFiles);
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		const swcOptions = {
			filename: file,
			sourceMaps: false,
			jsc: {
				target: "es2022",
				parser: { syntax: "typescript", tsx: file.endsWith(".tsx") },
				transform: { react: { runtime: "automatic" } },
				experimental: {
					plugins: [[linguiPlugin, { descriptorFields: "message" }]],
				},
			},
		};
		const compiled = await transformAsync(source, {
			filename: file,
			babelrc: false,
			configFile: false,
			parserOpts: { plugins: ["typescript", "jsx"] },
			plugins: [[reactCompiler, {}]],
		});
		const expected = descriptors(
			(await swc.transform(source, swcOptions)).code,
		);
		const built = descriptors(
			(await swc.transform(compiled?.code ?? "", swcOptions)).code,
		);
		for (const [id, message] of built) {
			if (expected.has(id)) continue;
			problems.push(`${relative(REPO_ROOT, file)}\n    ${id}: ${message}`);
		}
	}
	return { problems, files: files.length };
}

const packages = workspacePackages();
const apps = compilerApps();
if (apps.length === 0) {
	throw new Error(
		"No app sets reactCompiler: true with @lingui/swc-plugin; update scripts/check-compiled-ids.ts.",
	);
}
const results = await Promise.all(apps.map((app) => checkApp(app, packages)));
const problems = [...new Set(results.flatMap((result) => result.problems))];
const checkedFiles = results.reduce((sum, result) => sum + result.files, 0);
if (problems.length > 0) {
	console.error(
		`React Compiler changes ${problems.length} Lingui message(s), so production renders the raw id:\n`,
	);
	for (const problem of problems) console.error(`  ${problem}`);
	console.error(
		'\nSee "React Compiler" in packages/i18n/README.md for the fix.',
	);
	process.exit(1);
}
console.log(
	`React Compiler keeps every Lingui message id (${checkedFiles} file builds in ${apps.join(", ")}).`,
);
