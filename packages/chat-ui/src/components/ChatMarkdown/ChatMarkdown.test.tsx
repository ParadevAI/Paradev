import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
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
