import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import reactPlugin from "@vitejs/plugin-react";
import type { PluginOption } from "vite";

function isReactPlugin(plugin: PluginOption): boolean {
	return (
		typeof plugin === "object" &&
		plugin !== null &&
		"name" in plugin &&
		String(plugin.name).startsWith("vite:react")
	);
}

const config: StorybookConfig = {
	stories: [
		{ directory: "../src/components", files: "**/*.stories.@(ts|tsx)" },
		{ directory: "../src/atoms", files: "**/*.stories.@(ts|tsx)" },
		{
			directory: "../../chat-ui/src/components",
			files: "**/*.stories.@(ts|tsx)",
		},
	],
	framework: "@storybook/react-vite",
	viteFinal: (viteConfig) => {
		// Storybook adds its own React plugin; ours compiles the Lingui macro,
		// so it replaces Storybook's rather than stacking on it.
		const plugins = (viteConfig.plugins ?? []).flat(Number.POSITIVE_INFINITY);
		viteConfig.plugins = [
			...plugins.filter((plugin) => !isReactPlugin(plugin)),
			tailwindcss(),
			reactPlugin({
				babel: { plugins: ["@lingui/babel-plugin-lingui-macro"] },
			}),
		];
		return viteConfig;
	},
};

export default config;
