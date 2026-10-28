import { describe, expect, test } from "bun:test";
import { mermaidThemeConfig } from "./mermaidThemeConfig";

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
});
