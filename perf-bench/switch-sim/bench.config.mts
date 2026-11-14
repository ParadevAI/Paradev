import { resolve } from "node:path";
import electronViteConfig from "../../../electron.vite.config";

const rendererConfig = (electronViteConfig as { renderer: Record<string, any> })
	.renderer;

const flatten = (plugins: unknown[]): unknown[] =>
	plugins.flat(Number.POSITIVE_INFINITY).filter(Boolean);

const plugins = flatten(rendererConfig.plugins ?? []).filter((plugin) => {
	const name = (plugin as { name?: string }).name ?? "";
	return !name.includes("tanstack") && !name.includes("router");
});

const existingAlias = rendererConfig.resolve?.alias ?? [];
const alias = [
	{ find: /^react-dom\/client$/, replacement: "react-dom/profiling" },
	...(Array.isArray(existingAlias)
		? existingAlias
		: Object.entries(existingAlias).map(([find, replacement]) => ({
				find,
				replacement,
			}))),
];

export default {
	...rendererConfig,
	configFile: false,
	root: resolve(import.meta.dirname),
	base: "./",
	mode: "production",
	plugins,
	resolve: { ...rendererConfig.resolve, alias },
	build: {
		...rendererConfig.build,
		sourcemap: false,
		minify: process.env.BENCH_MINIFY !== "0",
		target: "chrome140",
		outDir: resolve(process.env.BENCH_OUT_DIR ?? resolve(import.meta.dirname, "dist")),
		emptyOutDir: true,
		rollupOptions: {
			...rendererConfig.build?.rollupOptions,
			input: { switch: resolve(import.meta.dirname, "switch.html") },
		},
	},
};
