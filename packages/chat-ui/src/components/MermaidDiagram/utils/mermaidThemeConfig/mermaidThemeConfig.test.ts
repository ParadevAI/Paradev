import { describe, expect, test } from "bun:test";
import { mermaidThemeConfig, normalizeCssColor } from "./mermaidThemeConfig";

const hexOnly = (value: string) => (value.startsWith("#") ? value : null);

describe("mermaidThemeConfig", () => {
	test("draws nodes in the app's card colour on its background", () => {
		const { themeVariables } = mermaidThemeConfig(
			{
				appearance: "light",
				colors: { background: "#fafafa", card: "#eeeeee", border: "#cccccc" },
			},
			hexOnly,
		);
		expect(themeVariables).toMatchObject({
			darkMode: false,
			background: "#fafafa",
			primaryColor: "#eeeeee",
			mainBkg: "#eeeeee",
			primaryBorderColor: "#cccccc",
		});
	});

	test("falls back per appearance when a colour cannot be read", () => {
		const dark = mermaidThemeConfig(
			{ appearance: "dark", colors: { background: "oklch(0.2 0 0)" } },
			hexOnly,
		);
		const light = mermaidThemeConfig({ appearance: "light" }, hexOnly);
		expect(dark.themeVariables?.darkMode).toBe(true);
		expect(dark.themeVariables?.background).toBe("#1e1e2e");
		expect(light.themeVariables?.background).toBe("#ffffff");
	});

	test("reads the app's oklch and hsl tokens as hex and refuses what it cannot read", () => {
		expect(normalizeCssColor("oklch(1 0 0)")).toBe("#ffffff");
		expect(normalizeCssColor("hsl(0 0% 0%)")).toBe("#000000");
		expect(normalizeCssColor("var(--background)")).toBeNull();
		expect(
			mermaidThemeConfig({
				appearance: "light",
				colors: { background: "oklch(1 0 0)" },
			}).themeVariables?.background,
		).toBe("#ffffff");
	});
});
