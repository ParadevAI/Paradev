import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../..");
const patched: Record<string, string> =
	JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
		.patchedDependencies ?? {};
const installed = join(import.meta.dir, "node_modules/react-native");
const reactNativeVersion: string = JSON.parse(
	readFileSync(join(installed, "package.json"), "utf8"),
).version;

describe("react-native safe-area scroll patch", () => {
	test("the installed react-native version is patched", () => {
		expect(patched[`react-native@${reactNativeVersion}`]).toBeString();
	});

	test("ScrollView pads its content by the side safe area", () => {
		const scrollView = readFileSync(
			join(installed, "Libraries/Components/ScrollView/ScrollView.js"),
			"utf8",
		);
		expect(scrollView).toContain("function getSafeAreaContentPadding(");
		expect(scrollView).toContain("experimental_onSafeAreaInsetsChange");
	});

	test("the native scroll view stops UIKit insetting the same edge again", () => {
		const enhancedScrollView = readFileSync(
			join(
				installed,
				"React/Fabric/Mounting/ComponentViews/ScrollView/RCTEnhancedScrollView.mm",
			),
			"utf8",
		);
		expect(enhancedScrollView).toContain("padsContentForSafeArea");
	});

	test("the app builds React Native from source, so the native half compiles in", () => {
		const appConfig = readFileSync(
			join(import.meta.dir, "app.config.ts"),
			"utf8",
		);
		expect(appConfig).toContain("buildReactNativeFromSource: true");
	});
});
