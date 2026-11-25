import { expect, test } from "bun:test";

function resolveConfig(webUrl: string) {
	const result = Bun.spawnSync(
		[
			process.execPath,
			"--eval",
			`const { default: appConfig } = await import("./app.config.ts");
			const config = appConfig({ config: {} });
			console.log(JSON.stringify({
				ios: config.ios.associatedDomains,
				android: config.android.intentFilters?.[0]?.data.map((entry) => entry.host),
			}));`,
		],
		{
			cwd: import.meta.dir,
			env: {
				PATH: process.env.PATH,
				MOBILE_EAS_BUILD: "1",
				EXPO_PUBLIC_WEB_URL: webUrl,
			},
		},
	);
	expect(result.stderr.toString()).toBe("");
	return JSON.parse(result.stdout.toString()) as {
		ios: string[];
		android: string[];
	};
}

test("app links open from the web host and its twin on the other root domain", () => {
	const { ios, android } = resolveConfig("https://app.paradev.com");
	expect(ios).toEqual(["applinks:app.paradev.com", "applinks:app.superset.sh"]);
	expect(new Set(android)).toEqual(
		new Set(["app.paradev.com", "app.superset.sh"]),
	);
});
