import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Without this fix, a screen pushed after a form sheet has been shown can come
// up with its ScrollView sized to the sheet (half the screen): everything below
// is neither painted nor tappable. It was our bun patch until
// react-native-screens shipped it (#4651, in 4.30). If this fails after a bump,
// restore the patch from patches/README.md; do NOT delete the test.
describe("react-native-screens form sheet scroll view fix", () => {
	test("an invalidated sheet does not resize its scroll view", () => {
		const source = readFileSync(
			join(
				import.meta.dir,
				"node_modules/react-native-screens/ios/RNSScreen.mm",
			),
			"utf8",
		);
		expect(source).toMatch(
			/applyFrameCorrectionForDescendantScrollView\s*\{[^}]*if \(_invalidated\) \{\s*return;/,
		);
	});
});
