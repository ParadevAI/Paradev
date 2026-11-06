import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useIsCodeFenceIncomplete } from "streamdown";
import { ChatMarkdown } from "./ChatMarkdown";

function render(markdown: string): string {
	return renderToStaticMarkup(<ChatMarkdown>{markdown}</ChatMarkdown>);
}

describe("ChatMarkdown", () => {
	test("shows a link whose URL is still streaming as its label only", () => {
		const html = render("See [the docs](https://exa");
		expect(html).toContain("See the docs");
		expect(html).not.toContain("[blocked]");
		expect(html).not.toContain("<a");
	});

	test("renders a finished link", () => {
		expect(render("See [the docs](https://example.com)")).toContain(
			'href="https://example.com/"',
		);
	});
});

describe("the code fence gate", () => {
	const seen: boolean[] = [];
	function Fence() {
		seen.push(useIsCodeFenceIncomplete());
		return null;
	}
	const renderFence = (markdown: string) =>
		renderToStaticMarkup(
			<ChatMarkdown components={{ code: Fence }}>{markdown}</ChatMarkdown>,
		);

	test("tells a block renderer whether its fence has closed", () => {
		seen.length = 0;
		renderFence("```mermaid\ngraph LR; A-->B\n");
		renderFence("```mermaid\ngraph LR; A-->B\n```\n");
		expect(seen).toEqual([true, false]);
	});
});
