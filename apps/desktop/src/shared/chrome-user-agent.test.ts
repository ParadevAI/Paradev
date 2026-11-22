import { expect, test } from "bun:test";
import { chromeUserAgent, firefoxUserAgent } from "./chrome-user-agent";

test("the pane names itself as Chrome, so sites and extensions do not take their Electron path", () => {
	const electron =
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Superset(SupersetbrowserlacksChromeextensionsupportforpasskeys)/2.0.0 Chrome/152.0.7977.167 Electron/44.9.3 Safari/537.36";

	expect(chromeUserAgent(electron)).toBe(
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
	);
});

test("on Google sign-in the pane says Firefox, on the platform it runs on", () => {
	const electron = (platform: string) =>
		`Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.167 Electron/44.10.0 Safari/537.36`;
	const firefox = (platform: string) =>
		`Mozilla/5.0 (${platform}; rv:154.0) Gecko/20100101 Firefox/154.0`;

	expect(firefoxUserAgent(electron("Macintosh; Intel Mac OS X 10_15_7"))).toBe(
		firefox("Macintosh; Intel Mac OS X 10.15"),
	);
	expect(firefoxUserAgent(electron("Windows NT 10.0; Win64; x64"))).toBe(
		firefox("Windows NT 10.0; Win64; x64"),
	);
	expect(firefoxUserAgent(electron("X11; Linux x86_64"))).toBe(
		firefox("X11; Linux x86_64"),
	);
});
