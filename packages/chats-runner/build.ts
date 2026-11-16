/**
 * Bundles dev-runner with every dependency into `dist/`, so the box image carries no node_modules: `runner.js`, the
 * worker pi resizes images in (`image-resize-worker.js`, which pi looks for next to its code), photon's wasm, a
 * package.json for pi to read its version from, and the `dev` CLI (`cli.js`). Those files are the runner bundle:
 * `manifest.json` lists each with its sha256, and the manifest's own sha256 names the bundle. The API serves it to boxes
 * and the image carries it as its fallback. `boot.js`, the image's entrypoint that picks the bundle, is outside it.
 */
import {
	copyFileSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { bundleManifest } from "./src/boot/boot.ts";

// The bundle names its sources relative to the working directory, and its id hashes them: the same everywhere it's built.
process.chdir(import.meta.dir);
const out = join(import.meta.dir, "dist");
const piDist = dirname(
	Bun.resolveSync("@earendil-works/pi-coding-agent", import.meta.dir),
);
const photonDir = dirname(
	Bun.resolveSync("@silvia-odwyer/photon-node/package.json", piDist),
);

/**
 * Boxes reach models only through the API's `/model` proxy, pi's AI Gateway provider, which speaks the Anthropic
 * Messages API. pi-ai imports the other providers' SDKs only from lazily loaded APIs, so these stubs never
 * run; if one ever does, that model's stream fails with the stub's error.
 */
const UNUSED_SDKS =
	/^(openai|@google\/genai|@aws-sdk\/[^/]+|@smithy\/[^/]+)(\/.*)?$/;

function check(result: Bun.BuildOutput) {
	if (result.success) return;
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

rmSync(out, { recursive: true, force: true });
const result = await Bun.build({
	entrypoints: [
		join(import.meta.dir, "src/main.ts"),
		join(piDist, "utils/image-resize-worker.js"),
	],
	outdir: out,
	naming: "[name].js",
	target: "node",
	format: "esm",
	// Syntax only: a stack trace prints its source line, which whitespace minifying makes the whole bundle.
	minify: { syntax: true },
	// pi's own Node bundle mode: extensions load through jiti's static entry with pi's modules built in, rather than
	// from a node_modules that isn't there.
	define: { PI_BUNDLED_NODE: "true" },
	plugins: [
		{
			name: "dev-box",
			setup(build) {
				build.onResolve({ filter: UNUSED_SDKS }, (args) => ({
					path: args.path,
					namespace: "unused-sdk",
				}));
				build.onLoad({ filter: /.*/, namespace: "unused-sdk" }, (args) => ({
					loader: "js",
					contents: `function unused() {
  throw new Error(${JSON.stringify(`${args.path} is not in dev-runner's bundle: boxes use the AI Gateway only`)});
}
module.exports = new Proxy(unused, { get: (_, key) => (key === "__esModule" ? undefined : unused) });`,
				}));
				// photon reads its wasm from its own folder; in the bundle that's the bundle's folder, where the build copies it.
				build.onLoad(
					{ filter: /photon-node[\\/]photon_rs\.js$/ },
					async (args) => {
						const source = await Bun.file(args.path).text();
						const wasmPath =
							"require('path').join(__dirname, 'photon_rs_bg.wasm')";
						if (!source.includes(wasmPath))
							throw new Error(
								`photon-node changed how it finds its wasm (${args.path})`,
							);
						const besideBundle =
							"require('path').join(require('path').dirname(require('url').fileURLToPath(import.meta.url)), 'photon_rs_bg.wasm')";
						return {
							loader: "js",
							contents: source.replace(wasmPath, besideBundle),
						};
					},
				);
			},
		},
	],
});
check(result);

renameSync(join(out, "main.js"), join(out, "runner.js"));
copyFileSync(
	join(photonDir, "photon_rs_bg.wasm"),
	join(out, "photon_rs_bg.wasm"),
);
const pi = JSON.parse(readFileSync(join(piDist, "..", "package.json"), "utf8"));
const pkg = { private: true, type: "module", version: pi.version };
writeFileSync(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
check(
	await Bun.build({
		entrypoints: [join(import.meta.dir, "../cli/src/main.ts")],
		outdir: out,
		naming: "cli.js",
		target: "node",
		format: "esm",
	}),
);

const bundle = [
	"runner.js",
	"image-resize-worker.js",
	"photon_rs_bg.wasm",
	"package.json",
	"cli.js",
];
const manifest = bundleManifest(
	Object.fromEntries(
		bundle.map((name) => [name, readFileSync(join(out, name))]),
	),
);
writeFileSync(join(out, "manifest.json"), manifest.bytes);

check(
	await Bun.build({
		entrypoints: [join(import.meta.dir, "src/boot.ts")],
		outdir: out,
		naming: "boot.js",
		target: "node",
		format: "esm",
	}),
);
console.log(`dev-runner: bundle ${manifest.sha} in ${out}`);
