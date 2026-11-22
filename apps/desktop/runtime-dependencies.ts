type PackagedNodeModuleCopy = {
	filter: string[];
	from: string;
	to: string;
};

type ExternalizedRuntimeModule = {
	asarUnpackGlobs: string[];
	/** Paths in the module, from building it or for other platforms, that never load at runtime. */
	buildLeftovers?: string[];
	materialize: string[];
	packagedCopies: PackagedNodeModuleCopy[];
	specifier: string;
};

function excluding(paths: string[], prefix = ""): string[] {
	return paths.map((path) => `!${prefix}${path}`);
}

function copyWholeModule(
	moduleName: string,
	buildLeftovers: string[] = [],
): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter: ["**/*", ...excluding(buildLeftovers)],
	};
}

function copyModuleSubtree(
	moduleName: string,
	filter: string[],
): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter,
	};
}

const betterSqliteLeftovers = [
	"deps/**/*",
	"src/**/*",
	"build/Release/obj/**/*",
	"build/Release/obj.target/**/*",
	"build/Release/*.a",
	"build/Release/test_extension.node",
];
const nodePtyLeftovers = [
	"src/**/*",
	"scripts/**/*",
	"build/Release/obj.target/**/*",
	"build/Release/.deps/**/*",
	`prebuilds/!(\${platform}-\${arch})/**/*`,
];
const parcelWatcherLeftovers = ["src/**/*", "build/Release/obj.target/**/*"];

const externalizedRuntimeModules: ExternalizedRuntimeModule[] = [
	{
		specifier: "better-sqlite3",
		materialize: ["better-sqlite3"],
		buildLeftovers: betterSqliteLeftovers,
		packagedCopies: [copyWholeModule("better-sqlite3", betterSqliteLeftovers)],
		asarUnpackGlobs: ["**/node_modules/better-sqlite3/**/*"],
	},
	{
		specifier: "node-pty",
		materialize: ["node-pty"],
		buildLeftovers: nodePtyLeftovers,
		packagedCopies: [copyWholeModule("node-pty", nodePtyLeftovers)],
		asarUnpackGlobs: ["**/node_modules/node-pty/**/*"],
	},
	{
		specifier: "native-keymap",
		materialize: ["native-keymap"],
		packagedCopies: [copyWholeModule("native-keymap")],
		asarUnpackGlobs: ["**/node_modules/native-keymap/**/*"],
	},
	{
		specifier: "@superset/macos-process-metrics",
		materialize: ["@superset/macos-process-metrics"],
		packagedCopies: [copyWholeModule("@superset/macos-process-metrics")],
		asarUnpackGlobs: ["**/node_modules/@superset/macos-process-metrics/**/*"],
	},
	{
		specifier: "@parcel/watcher",
		materialize: ["@parcel/watcher"],
		buildLeftovers: parcelWatcherLeftovers,
		packagedCopies: [
			copyModuleSubtree("@parcel", [
				"watcher/**/*",
				"watcher-*/**/*",
				...excluding(parcelWatcherLeftovers, "watcher/"),
			]),
		],
		asarUnpackGlobs: ["**/node_modules/@parcel/watcher*/**/*"],
	},
];

/** The device hub runs as its own process from app.asar.unpacked, so it and
 * everything it loads at runtime must be real files there. */
const deviceHubUnpackGlobs = [
	"**/node_modules/expo-device-hub/**/*",
	"**/node_modules/ws/**/*",
	"**/node_modules/mediabunny/**/*",
	"**/node_modules/@fastify/busboy/**/*",
];

const packagedSupportModules = [
	copyWholeModule("bindings"),
	copyWholeModule("file-uri-to-path"),
	copyWholeModule("detect-libc"),
	copyWholeModule("is-glob"),
	copyWholeModule("is-extglob"),
	copyWholeModule("picomatch"),
	copyWholeModule("node-addon-api"),
];

export const mainExternalizedDependencies = [
	...externalizedRuntimeModules.map((module) => module.specifier),
	"pg-native",
];

export const packagedNodeModuleCopies = [
	...externalizedRuntimeModules.flatMap((module) => module.packagedCopies),
	...packagedSupportModules,
];

/** The same leftovers for the copy electron-builder makes of every package in `dependencies`. */
export const packagedNodeModuleExclusions = externalizedRuntimeModules.flatMap(
	(module) =>
		excluding(
			module.buildLeftovers ?? [],
			`**/node_modules/${module.specifier}/`,
		),
);

export const packagedAsarUnpackGlobs = [
	...externalizedRuntimeModules.flatMap((module) => module.asarUnpackGlobs),
	...deviceHubUnpackGlobs,
	"**/node_modules/bindings/**/*",
	"**/node_modules/file-uri-to-path/**/*",
];

export const requiredMaterializedNodeModules = [
	...externalizedRuntimeModules.flatMap((module) => module.materialize),
	"bindings",
	"file-uri-to-path",
	"detect-libc",
	"is-glob",
	"is-extglob",
	"picomatch",
	"node-addon-api",
];
