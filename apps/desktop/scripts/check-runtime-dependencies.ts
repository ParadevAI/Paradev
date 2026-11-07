// A packaged build ships only package.json `dependencies`; Vite bundles the rest.
// Fails the build when compiled main-process code loads a package that would not ship.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ACP_HARNESSES } from "@superset/host-service/acp-catalogue";
import { dependencies } from "../package.json";

const desktopDir = join(import.meta.dirname, "..");
const scannedDirs = ["dist/main", "dist/preload"].map((dir) =>
	join(desktopDir, dir),
);
const installedRoots = [
	join(desktopDir, "node_modules"),
	join(desktopDir, "../../node_modules"),
];
const shipped = new Set(["electron", ...Object.keys(dependencies)]);

// A quote before the call means generated code held in a string (ajv), not a real load.
const RUNTIME_LOAD =
	/(?<!["'`])\b(?:require(?:\$\d+)?(?:\.resolve)?|\)\.resolve|import)\s*\(\s*["']([^"'./][^"']*)["']/g;

function packageName(specifier: string): string {
	const parts = specifier.split("/");
	return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isInstalledPackage(name: string): boolean {
	return installedRoots.some((root) =>
		existsSync(join(root, name, "package.json")),
	);
}

function* compiledFiles(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* compiledFiles(path);
		else if (/\.(c|m)?js$/.test(entry.name)) yield path;
	}
}

const loadedBy = new Map<string, Set<string>>();
for (const dir of scannedDirs) {
	for (const file of compiledFiles(dir)) {
		for (const [, specifier] of readFileSync(file, "utf8").matchAll(
			RUNTIME_LOAD,
		)) {
			const name = packageName(specifier);
			if (!isInstalledPackage(name)) continue;
			const files = loadedBy.get(name) ?? new Set<string>();
			files.add(relative(desktopDir, file));
			loadedBy.set(name, files);
		}
	}
}
for (const harness of Object.values(ACP_HARNESSES)) {
	if (harness.adapter) {
		loadedBy.set(harness.adapter, new Set(["ACP_HARNESSES (spawned adapter)"]));
	}
}

const missing = [...loadedBy].filter(([name]) => !shipped.has(name));
if (missing.length > 0) {
	console.error(
		"[check:runtime-dependencies] These packages load at runtime but are not in apps/desktop dependencies, so the packaged app would not ship them:",
	);
	for (const [name, files] of missing) {
		console.error(`  ${name}  (${[...files].join(", ")})`);
	}
	console.error(
		"Move each one from devDependencies to dependencies in apps/desktop/package.json.",
	);
	process.exit(1);
}
console.log(
	`[check:runtime-dependencies] OK: ${loadedBy.size} runtime packages, all in dependencies.`,
);
