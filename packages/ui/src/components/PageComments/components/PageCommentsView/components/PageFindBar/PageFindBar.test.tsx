import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_PAGE_FIND_STATE } from "../../hooks/usePageFind/utils/pageFindState";
import { PageFindBar } from "./PageFindBar";

const noop = () => {};

function statusSlot(state: Parameters<typeof PageFindBar>[0]["state"]) {
	const markup = renderToStaticMarkup(
		<PageFindBar
			state={state}
			onQueryChange={noop}
			onNext={noop}
			onPrevious={noop}
			onClose={noop}
		/>,
	);
	return /<span aria-live="polite" class="([^"]*)">([^<]*)<\/span>/.exec(
		markup,
	);
}

describe("PageFindBar", () => {
	test("keeps the count slot while a search is pending, so the bar holds its width", () => {
		const open = {
			...INITIAL_PAGE_FIND_STATE,
			open: true,
			availability: "available" as const,
			query: "cat",
		};
		const pending = statusSlot(open);
		const answered = statusSlot({
			...open,
			result: { total: 12, index: 2, capped: false },
		});

		expect(pending?.[2]).toBe("");
		expect(answered?.[2]).toBe("3 of 12");
		expect(pending?.[1]).toBe(answered?.[1]);
	});
});
