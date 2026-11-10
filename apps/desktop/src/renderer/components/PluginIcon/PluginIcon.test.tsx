import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PluginIcon } from "./PluginIcon";

const ARTWORK = "data:image/png;base64,QUNNRQ==";

describe("PluginIcon", () => {
	it("uses the built-in icon a manifest names", () => {
		const markup = renderToStaticMarkup(
			<PluginIcon pluginName="acme" icon="slack" />,
		);
		expect(markup).toContain("<img");
		expect(markup).toContain("slack");
	});

	it("shows the artwork a plugin ships when no built-in icon matches", () => {
		const markup = renderToStaticMarkup(
			<PluginIcon pluginName="acme" icon="./icon.png" iconUrl={ARTWORK} />,
		);
		expect(markup).toContain(`src="${ARTWORK}"`);
	});

	it("keeps a first-party plugin's own icon over shipped artwork", () => {
		const markup = renderToStaticMarkup(
			<PluginIcon pluginName="slack" iconUrl={ARTWORK} />,
		);
		expect(markup).not.toContain(ARTWORK);
		expect(markup).toContain("slack");
	});

	it("falls back to the puzzle glyph", () => {
		const markup = renderToStaticMarkup(
			<PluginIcon pluginName="acme" icon="./icon.png" />,
		);
		expect(markup).not.toContain("<img");
		expect(markup).toContain("<svg");
	});
});
