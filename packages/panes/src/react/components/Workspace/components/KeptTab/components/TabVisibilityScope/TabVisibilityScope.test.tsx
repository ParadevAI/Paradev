import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	TabVisibilityContext,
	useIsTabVisible,
} from "../../../../../../hooks/useIsTabVisible";
import { TabVisibilityScope } from "./TabVisibilityScope";

function Probe() {
	return <i>{String(useIsTabVisible())}</i>;
}

function seenBy(parentVisible: boolean, tabVisible: boolean) {
	return renderToStaticMarkup(
		<TabVisibilityContext.Provider value={parentVisible}>
			<TabVisibilityScope visible={tabVisible}>
				<Probe />
			</TabVisibilityScope>
		</TabVisibilityContext.Provider>,
	);
}

describe("TabVisibilityScope", () => {
	test("an active tab is hidden while its parent is hidden", () => {
		expect(seenBy(false, true)).toBe("<i>false</i>");
		expect(seenBy(true, true)).toBe("<i>true</i>");
	});

	test("an inactive tab stays hidden when its parent is shown", () => {
		expect(seenBy(true, false)).toBe("<i>false</i>");
		expect(seenBy(false, false)).toBe("<i>false</i>");
	});
});
