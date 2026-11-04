/**
 * Prepare native modules for electron-builder.
 *
 * With Bun 1.3+ isolated installs, node_modules contains symlinks to packages
 * stored in node_modules/.bun/. electron-builder cannot follow these symlinks
 * when creating asar archives.
 *
 * This script:
 * 1. Detects if native modules are symlinks
 * 2. Replaces symlinks with actual file copies
 * 3. electron-builder can then properly package and unpack them
 *
 * This is safe because bun install will recreate the symlinks on next install.
 */

import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { requiredMaterializedNodeModules } from "../runtime-dependencies";

const TARGET_ARCH = process.env.TARGET_ARCH || process.arch;
const TARGET_PLATFORM = process.env.TARGET_PLATFORM || process.platform;

function getWorkspaceRootNodeModulesDir(nodeModulesDir: string): string {
	return join(nodeModulesDir, "..", "..", "..", "node_modules");
}

function getBunFlatNodeModulesDir(nodeModulesDir: string): string {
	return join(
		getWorkspaceRootNodeModulesDir(nodeModulesDir),
		".bun",
		"node_modules",
	);
}

function getBunStoreDir(nodeModulesDir: string): string {
	return join(getWorkspaceRootNodeModulesDir(nodeModulesDir), ".bun");
}

function findBunStoreFolderName(
	bunStoreDir: string,
	moduleName: string,
	version: string,
): string | null {
	if (!existsSync(bunStoreDir)) return null;
	const entries = readdirSync(bunStoreDir);
	const modulePrefix = `${moduleName.replace("/", "+")}@`;
	const exactPrefix = `${modulePrefix}${version}`;
	const exactMatch = entries.find((entry) => entry.startsWith(exactPrefix));
	if (exactMatch) return exactMatch;
	return entries.find((entry) => entry.startsWith(modulePrefix)) ?? null;
}

function copyModuleIfSymlink(
	nodeModulesDir: string,
	moduleName: string,
	required: boolean,
): boolean {
	const modulePath = join(nodeModulesDir, moduleName);
	const bunFlatNodeModulesDir = getBunFlatNodeModulesDir(nodeModulesDir);
	const bunFlatModulePath = join(bunFlatNodeModulesDir, moduleName);

	if (!existsSync(modulePath)) {
		if (existsSync(bunFlatModulePath)) {
			console.log(`  ${moduleName}: materializing from Bun store index`);
			mkdirSync(dirname(modulePath), { recursive: true });
			cpSync(realpathSync(bunFlatModulePath), modulePath, { recursive: true });
			console.log(`    Copied to: ${modulePath}`);
			return true;
		}
		if (required) {
			console.error(`  [ERROR] ${moduleName} not found at ${modulePath}`);
			process.exit(1);
		}
		console.log(`  ${moduleName}: not found (skipping)`);
		return false;
	}

	const stats = lstatSync(modulePath);

	if (stats.isSymbolicLink()) {
		// Resolve symlink to get real path
		const realPath = realpathSync(modulePath);
		console.log(`  ${moduleName}: symlink -> replacing with real files`);
		console.log(`    Real path: ${realPath}`);

		// Remove the symlink
		rmSync(modulePath);

		// Copy the actual files
		cpSync(realPath, modulePath, { recursive: true });

		console.log(`    Copied to: ${modulePath}`);
	} else {
		console.log(`  ${moduleName}: already real directory (not a symlink)`);
	}

	return true;
}

function copyParcelWatcherPlatformPackages(nodeModulesDir: string): void {
	const watcherPath = join(nodeModulesDir, "@parcel", "watcher");
	const watcherPkgJsonPath = join(watcherPath, "package.json");
	if (!existsSync(watcherPkgJsonPath)) return;

	type ParcelWatcherPackageJson = {
		optionalDependencies?: Record<string, string>;
	};
	const watcherPkg = JSON.parse(
		readFileSync(watcherPkgJsonPath, "utf8"),
	) as ParcelWatcherPackageJson;
	const optionalDeps = watcherPkg.optionalDependencies ?? {};
	const platformPackages = Object.entries(optionalDeps)
		.filter(([name]) => name.startsWith("@parcel/watcher-"))
		.map(([name, version]) => ({ name, version }));

	if (platformPackages.length === 0) return;

	console.log("\nPreparing parcel watcher platform package...");
	const bunStoreDir = getBunStoreDir(nodeModulesDir);
	let resolvedPlatformPackage = false;

	for (const platformPkg of platformPackages) {
		const destPath = join(nodeModulesDir, platformPkg.name);
		if (existsSync(destPath)) {
			resolvedPlatformPackage =
				copyModuleIfSymlink(nodeModulesDir, platformPkg.name, false) ||
				resolvedPlatformPackage;
			continue;
		}

		const bunStoreFolderName = findBunStoreFolderName(
			bunStoreDir,
			platformPkg.name,
			platformPkg.version,
		);
		if (!bunStoreFolderName) {
			console.warn(
				`  ${platformPkg.name}: no Bun store entry matched version ${platformPkg.version}`,
			);
			continue;
		}

		const sourcePath = join(
			bunStoreDir,
			bunStoreFolderName,
			"node_modules",
			platformPkg.name,
		);
		if (!existsSync(sourcePath)) {
			console.warn(
				`  ${platformPkg.name}: Bun store path missing after resolve (${sourcePath})`,
			);
			continue;
		}

		console.log(`  ${platformPkg.name}: copying from Bun store`);
		mkdirSync(dirname(destPath), { recursive: true });
		cpSync(sourcePath, destPath, { recursive: true });
		resolvedPlatformPackage = true;
	}

	if (!resolvedPlatformPackage) {
		console.error(
			"  [ERROR] No `@parcel/watcher-<platform>` runtime package was materialized",
		);
		process.exit(1);
	}
}

function prepareNativeModules() {
	console.log("Preparing external runtime modules for electron-builder...");
	console.log(
		`  Target: ${TARGET_PLATFORM}/${TARGET_ARCH} (host: ${process.platform}/${process.arch})`,
	);

	// bun creates symlinks for direct dependencies in the workspace's node_modules
	const nodeModulesDir = join(dirname(import.meta.dirname), "node_modules");

	console.log("\nMaterializing packaged runtime modules...");
	for (const moduleName of requiredMaterializedNodeModules) {
		copyModuleIfSymlink(nodeModulesDir, moduleName, true);
	}

	copyParcelWatcherPlatformPackages(nodeModulesDir);

	console.log("\nDone!");
}

prepareNativeModules();
