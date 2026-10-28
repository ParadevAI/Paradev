import type { MermaidRenderer } from "../../types";

let renders = 0;

/** Loads Mermaid on first use: most replies never need the bundle. */
export const renderMermaid: MermaidRenderer = async (source, config) => {
	const { mermaidConfig, mermaidPlugins } = await import(
		"@superset/ui/lib/mermaid"
	);
	const plugin = mermaidPlugins.mermaid;
	if (!plugin) throw new Error("Mermaid is not available");
	renders += 1;
	const { svg } = await plugin
		.getMermaid(mermaidConfig(config).config)
		.render(`chat-mermaid-${renders}`, source);
	return svg;
};
