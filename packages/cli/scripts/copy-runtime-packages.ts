import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";

/** The node_modules dirs Node searches from a package, nearest first. */
type Lookup = [string, ...string[]];

type CopiedPackage = { source: string; lookup: Lookup };

function findPackagePath(
	packageName: string,
	startDir: string,
	repoRoot: string,
): string | null {
	let current = startDir;
	while (current.startsWith(repoRoot)) {
		const candidate = join(current, "node_modules", packageName);
		if (existsSync(candidate)) return realpathSync(candidate);
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	const fallbacks = [
		join(repoRoot, "packages", "host-service", "node_modules", packageName),
		join(repoRoot, "packages", "workspace-fs", "node_modules", packageName),
		join(repoRoot, "node_modules", packageName),
	];
	for (const fallback of fallbacks) {
		if (existsSync(fallback)) return realpathSync(fallback);
	}
	// Bun isolated store fallback: node_modules/.bun/<encoded>@<ver>/node_modules/<name>
	// where scoped names have `/` encoded as `+` in the store directory.
	// If multiple versions exist, error rather than silently picking one —
	// the walker is meant to be deterministic for reproducible tarballs.
	const bunStore = join(repoRoot, "node_modules", ".bun");
	if (existsSync(bunStore)) {
		const encoded = packageName.replace("/", "+");
		const prefix = `${encoded}@`;
		const matches = readdirSync(bunStore)
			.filter((entry) => entry.startsWith(prefix))
			.map((entry) => join(bunStore, entry, "node_modules", packageName))
			.filter((candidate) => existsSync(candidate));
		if (matches.length === 1) return realpathSync(matches[0] as string);
		if (matches.length > 1) {
			throw new Error(
				`Ambiguous Bun store matches for ${packageName}: ${matches.join(", ")}`,
			);
		}
	}
	return null;
}

function dependenciesOf(source: string): { name: string; optional: boolean }[] {
	const packageJsonPath = join(source, "package.json");
	if (!existsSync(packageJsonPath)) return [];
	const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
	const peerMeta = pkg.peerDependenciesMeta ?? {};
	return [
		...Object.keys(pkg.dependencies ?? {}).map((name) => ({
			name,
			optional: false,
		})),
		// Packages we ship unbundled load their peer
		// deps from disk at module init — a bundled consumer's inlined copy
		// is invisible to them. Walk non-optional peers best-effort: one the
		// installer didn't materialize is skipped rather than failing the build.
		...Object.keys(pkg.peerDependencies ?? {})
			.filter((name) => !peerMeta[name]?.optional)
			.map((name) => ({ name, optional: true })),
	];
}

/**
 * Copies `packages` and their dependencies into `destModules`. A dependency
 * goes under its dependent when another version of it is already in the way.
 */
export function copyPackagesWithDeps(
	packages: readonly string[],
	startDir: string,
	repoRoot: string,
	destModules: string,
): void {
	const copied = new Map<string, string>();

	const copy = (
		name: string,
		source: string,
		parentLookup: Lookup,
	): CopiedPackage => {
		const dest = join(parentLookup[0], name);
		mkdirSync(dirname(dest), { recursive: true });
		cpSync(source, dest, { recursive: true, dereference: true });
		copied.set(dest, source);
		return { source, lookup: [join(dest, "node_modules"), ...parentLookup] };
	};

	// Every direct dependency is placed before any of them is walked, so a
	// copy placed later can never shadow one an earlier package resolved.
	const copyDependencies = (pkg: CopiedPackage): void => {
		const added: CopiedPackage[] = [];
		for (const dep of dependenciesOf(pkg.source)) {
			const source = findPackagePath(dep.name, pkg.source, repoRoot);
			if (!source) {
				if (dep.optional) {
					console.warn(
						`[build-dist]   skipping peer dep not installed: ${dep.name}`,
					);
					continue;
				}
				throw new Error(
					`Package not found: ${dep.name}. Run 'bun install' first.`,
				);
			}
			const nearest = pkg.lookup
				.map((dir) => copied.get(join(dir, dep.name)))
				.find((copiedSource) => copiedSource !== undefined);
			if (nearest === undefined) {
				added.push(copy(dep.name, source, [destModules]));
			} else if (nearest !== source) {
				added.push(copy(dep.name, source, pkg.lookup));
			}
		}
		for (const child of added) copyDependencies(child);
	};

	const roots = packages.map((name) => {
		const source = findPackagePath(name, startDir, repoRoot);
		if (!source) {
			throw new Error(`Package not found: ${name}. Run 'bun install' first.`);
		}
		return copy(name, source, [destModules]);
	});
	for (const root of roots) copyDependencies(root);
}
