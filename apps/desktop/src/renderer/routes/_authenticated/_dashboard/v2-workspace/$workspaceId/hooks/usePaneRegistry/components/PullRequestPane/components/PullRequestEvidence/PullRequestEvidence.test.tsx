import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@superset/i18n";
import {
	cleanup,
	fireEvent,
	render as renderComponent,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { PullRequestEvidence } from "./PullRequestEvidence";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

function render(element: ReactNode) {
	return renderComponent(element, {
		wrapper: ({ children }) => (
			<I18nProvider i18n={i18n}>{children}</I18nProvider>
		),
	});
}

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const pages = ["Test Results", "Screenshots", "CDP Video"].map(
	(title, index) => ({
		id: `page-${index}`,
		slug: `page-${index}`,
		title,
		thumbnailUrl: index === 0 ? "https://example.test/thumbnail.png" : null,
	}),
);
const defaults = {
	pages,
	totalCount: 3,
	moreCount: 0,
	onShowMore: () => {},
	isPending: false,
	isError: false,
	onRetry: () => {},
	onOpenPage: () => {},
};

describe("PR evidence", () => {
	test("opens the selected page and counts the linked pages", () => {
		const onOpenPage = mock(() => {});
		const view = render(
			<PullRequestEvidence {...defaults} onOpenPage={onOpenPage} />,
		);
		fireEvent.click(view.getByRole("button", { name: "Screenshots" }));
		expect(onOpenPage).toHaveBeenCalledWith(pages[1]);
		expect(view.getByRole("heading").textContent).toBe("Pages3");
	});

	test("keeps a page usable when its thumbnail fails", () => {
		const onOpenPage = mock(() => {});
		const view = render(
			<PullRequestEvidence {...defaults} onOpenPage={onOpenPage} />,
		);
		const image = view.container.querySelector("img");
		expect(image).not.toBeNull();
		if (image) fireEvent.error(image);
		expect(view.container.querySelector("img")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Test Results" }));
		expect(onOpenPage).toHaveBeenCalledWith(pages[0]);
	});

	test("offers the links beyond the preview limit", () => {
		const onShowMore = mock(() => {});
		const view = render(
			<PullRequestEvidence
				{...defaults}
				totalCount={undefined}
				moreCount={4}
				onShowMore={onShowMore}
			/>,
		);
		fireEvent.click(view.getByRole("button", { name: "Show 4 more" }));
		expect(onShowMore).toHaveBeenCalledTimes(1);
	});

	test("distinguishes loading from failure with retry", () => {
		const onRetry = mock(() => {});
		const view = render(
			<PullRequestEvidence
				{...defaults}
				pages={[]}
				totalCount={undefined}
				isPending
			/>,
		);
		expect(view.getByRole("status")).toBeTruthy();
		view.rerender(
			<PullRequestEvidence
				{...defaults}
				pages={[]}
				totalCount={undefined}
				isError
				onRetry={onRetry}
			/>,
		);
		expect(view.getByRole("alert").textContent).toContain(
			"Pages could not be loaded",
		);
		fireEvent.click(view.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
