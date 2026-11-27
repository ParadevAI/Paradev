import { describe, expect, it } from "bun:test";
import { parseThemeConfigFile } from "./import";

const t3Skin = {
	version: 1,
	name: "E2B",
	appearance: "dark",
	colors: {
		canvas: "#0a0a0a",
		text: "#f4f4f4",
		accent: "#e32a01",
		accentForeground: "#ffffff",
		sidebarRowActive: "#1f1f1f",
		terminalBackground: "#000000",
		terminalCursor: "#e32a01",
	},
};

describe("T3 Code skins", () => {
	it("imports a skin.json from t3skins.dev", () => {
		const result = parseThemeConfigFile(JSON.stringify(t3Skin));

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const [theme] = result.themes;
		expect(theme?.id).toBe("e2b");
		expect(theme?.type).toBe("dark");
		expect(theme?.ui.background).toBe("#0a0a0a");
		expect(theme?.ui.foreground).toBe("#f4f4f4");
		expect(theme?.ui.primary).toBe("#e32a01");
		expect(theme?.ui.sidebarAccent).toBe("#1f1f1f");
		expect(theme?.ui.chart2).toBeDefined();
		expect(theme?.terminal?.background).toBe("#000000");
		expect(theme?.terminal?.cursor).toBe("#e32a01");
		expect(theme?.terminal?.red).toBeDefined();
	});

	it("imports the skin's other appearance as a second theme", () => {
		const result = parseThemeConfigFile(
			JSON.stringify({
				...t3Skin,
				variants: { light: { canvas: "#ffffff", accent: "#e32a01" } },
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const [dark, light] = result.themes;
		expect(dark?.id).toBe("e2b");
		expect(light?.id).toBe("e2b-light");
		expect(light?.name).toBe("E2B Light");
		expect(light?.type).toBe("light");
		expect(light?.ui.background).toBe("#ffffff");
	});
});
