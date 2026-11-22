import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the interactive push hunks of the react-native-screens bun patch
// (patches/README.md). modules/forward-swipe calls these selectors only when
// the stack responds to them, so a dropped patch does not crash: the swipe on
// Home falls back to a plain animated push that ignores the finger. If this
// fails after a bump, re-apply the hunks; do NOT delete the test.
const screensIos = join(
	import.meta.dir,
	"node_modules/react-native-screens/ios",
);
const read = (file: string) => readFileSync(join(screensIos, file), "utf8");

describe("react-native-screens interactive push patch", () => {
	test("the stack exposes the selectors forward-swipe calls", () => {
		const header = read("RNSScreenStack.h");
		expect(header).toContain("- (void)armInteractivePush;");
		expect(header).toContain("- (void)updateInteractivePush:(double)progress;");
		expect(header).toContain("- (void)endInteractivePush:(BOOL)finish;");
	});

	test("an armed push gets the interactive animator", () => {
		expect(read("RNSScreenStack.mm")).toContain(
			"operation == UINavigationControllerOperationPush && _interactivePushArmed",
		);
		expect(read("RNSPercentDrivenInteractiveTransition.mm")).toContain(
			"onStart();",
		);
		expect(read("RNSScreenStackAnimator.mm")).toContain(
			"an interactive push follows the finger linearly",
		);
	});
});
