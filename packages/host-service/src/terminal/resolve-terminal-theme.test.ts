import { describe, expect, it } from "bun:test";
import { resolveTerminalTheme } from "./resolve-terminal-theme";

const lightColors = {
	foreground: "#1a1a1a",
	background: "#fafafa",
	cursor: "#1a1a1a",
};
const darkColors = {
	foreground: "#eeeeee",
	background: "#101010",
	cursor: "#eeeeee",
};

describe("resolveTerminalTheme", () => {
	it("gives a request with no theme the theme the desktop pushed to the host", () => {
		const hostTheme = { themeType: "light" as const, colors: lightColors };
		expect(resolveTerminalTheme({ hostTheme })).toEqual(hostTheme);
	});

	it("falls back to dark on a host no desktop has pushed to", () => {
		expect(resolveTerminalTheme({ hostTheme: null })).toEqual({
			themeType: undefined,
			colors: undefined,
		});
	});

	it("keeps an explicit theme and drops host colors of the other kind", () => {
		const hostTheme = { themeType: "light" as const, colors: lightColors };
		expect(resolveTerminalTheme({ themeType: "dark", hostTheme })).toEqual({
			themeType: "dark",
			colors: undefined,
		});
		expect(resolveTerminalTheme({ colors: darkColors, hostTheme })).toEqual({
			themeType: "dark",
			colors: darkColors,
		});
	});
});
