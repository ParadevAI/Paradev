import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import {
	type MermaidRenderer,
	MermaidRendererProvider,
} from "@superset/chat-ui/MermaidDiagram";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ChatCodeBlock } from "../../ChatCodeBlock";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
afterEach(cleanup);

const settle = () => act(() => new Promise((done) => setTimeout(done, 0)));
const drawn: MermaidRenderer = async () =>
	'<svg viewBox="0 0 10 10" data-drawn="1"></svg>';

function renderMermaid(markdown: string, renderer: MermaidRenderer) {
	return render(
		<MermaidRendererProvider renderer={renderer}>
			<ChatMarkdown components={{ code: ChatCodeBlock }}>
				{markdown}
			</ChatMarkdown>
		</MermaidRendererProvider>,
	);
}

test("draws a closed fence without a card and keeps the code a toggle away", async () => {
	const view = renderMermaid("```mermaid\ngraph LR; A-->B\n```\n", drawn);
	await settle();
	expect(view.container.querySelector("svg[data-drawn]")).toBeTruthy();
	// No header while the drawing shows: no language label, no wrap toggle.
	expect(view.queryByText("Mermaid")).toBeNull();
	expect(view.queryByRole("button", { name: "Wrap lines" })).toBeNull();
	// The diagram itself and the toolbar button both open the lightbox.
	expect(view.getAllByRole("button", { name: "Expand diagram" })).toHaveLength(
		2,
	);

	fireEvent.click(view.getByRole("button", { name: "Show code" }));
	expect(view.container.querySelector("svg[data-drawn]")).toBeNull();
	expect(view.getByText("Mermaid")).toBeTruthy();
	expect(view.getByRole("button", { name: "Wrap lines" })).toBeTruthy();

	fireEvent.click(view.getByRole("button", { name: "Diagram" }));
	expect(view.container.querySelector("svg[data-drawn]")).toBeTruthy();
});

test("shows the code and draws nothing while the fence is still open", async () => {
	const sources: string[] = [];
	const view = renderMermaid(
		"```mermaid\ngraph LR; A-->B\n",
		async (source) => {
			sources.push(source);
			return "<svg></svg>";
		},
	);
	await settle();
	expect(sources).toEqual([]);
	expect(view.queryByRole("group", { name: "View" })).toBeNull();
	expect(view.getByRole("button", { name: "Wrap lines" })).toBeTruthy();
});

test("falls back to the code with the whole reason when the diagram cannot be drawn", async () => {
	const view = renderMermaid("```mermaid\nnot a diagram\n```\n", async () => {
		throw new Error("Parse error on line 1:\n...^\nExpecting 'NEWLINE'");
	});
	await settle();
	expect(
		view.getByText(
			/^Diagram could not be drawn: Parse error on line 1: \.\.\.\^ Expecting 'NEWLINE'$/,
		),
	).toBeTruthy();
	expect(view.queryByRole("group", { name: "View" })).toBeNull();
	expect(view.container.querySelector("svg[data-drawn]")).toBeNull();
});
