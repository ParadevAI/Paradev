import { expect, test } from "bun:test";
import { drawMermaid } from "./drawMermaid";

test("draws a diagram that takes its colours from CSS variables", async () => {
	const svg = await drawMermaid("flowchart LR\n  A[Start] --> B[Done]");
	expect(svg).toMatch(/^<svg[^>]* class="pele pele-flowchart"/);
	expect(svg).toContain("var(--pele-surface");
	expect(svg).toContain("Start");
});

test("rejects with the parser's message", async () => {
	await expect(drawMermaid("flowchart TD\n  A -->")).rejects.toThrow(
		/^Parse error on line \d+:/,
	);
	await expect(drawMermaid("just a sentence")).rejects.toThrow(
		"No diagram type detected",
	);
});
