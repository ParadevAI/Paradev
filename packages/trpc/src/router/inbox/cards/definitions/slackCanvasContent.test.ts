import { expect, test } from "bun:test";
import { canvasMarkdown, canvasSections } from "./slackCanvasContent";

const HTML = `<div class="quip-canvas-content"><h1 id="t1">Launch plan</h1><h1 id="h1">Launch checklist</h1><div data-section-style='5' class="list-numbering-restart-at" style="--indent0: 0"><ul id='u1'><li id='l1' value='1'><span id="l1">Write the announcement</span><br/></li><li id='l2'><span id="l2">Tell support</span><br/></li></ul></div><p id="p1" class="line">Owner: Satya &amp; Blake</p><h2 id="h2">Risks</h2><div data-section-style='6' class="list-numbering-restart-at"><ul id='u2'><li id='n1' value='1'><span id="n1">Pricing page is not updated</span><br/></li><li id='n2'><span id="n2"><b>Support</b> macro is missing</span><br/></li></ul></div><div data-section-style='7' class="list-numbering-restart-at"><ul id='u3'><li id='c1' value='1'><span id="c1">Draft the email</span><br/></li><li id='c2' class='checked'><span id="c2">Book the room</span><br/></li></ul></div><p id="e1" class="line"></p><blockquote><p id="q1" class="line">Quote line</p></blockquote><p id="k1" class="prettyprint line">code line</p><p id="p2" class="line">See <lnk href="https://example.com">the plan</lnk> and <code>inline</code>.</p></div>`;

test("reads Slack's canvas HTML into sections that keep Slack's own ids, without the title", () => {
	const sections = canvasSections(HTML);
	expect(
		sections.map((section) => `${section.id} ${section.markdown}`),
	).toEqual([
		"h1 # Launch checklist",
		"l1 - Write the announcement",
		"l2 - Tell support",
		"p1 Owner: Satya & Blake",
		"h2 ## Risks",
		"n1 1. Pricing page is not updated",
		"n2 2. **Support** macro is missing",
		"c1 - [ ] Draft the email",
		"c2 - [x] Book the room",
		"e1 ",
		"q1 > Quote line",
		"k1 ```\ncode line\n```",
		"p2 See [the plan](https://example.com) and `inline`.",
	]);
	expect(sections[6]?.text).toBe("Support macro is missing");
});

test("keeps a heading that is not the title, splits a quote by paragraph, drops table cells, and marks what markdown cannot say", () => {
	const html = `<div class="quip-canvas-content"><h1 id="t">Plan</h1><h1 id="h">Plan B</h1><blockquote class="q"><p id="q1" class="line">One</p><p id="q2" class="line">Two &#8217;s</p></blockquote><table><tr><td><p id="c" class="line">Cell</p></td></tr></table><p id="m" class="line">Ask <control data-id="U1">@Avery</control></p></div>`;
	expect(
		canvasSections(html, "Plan").map(
			(section) => `${section.id} ${section.markdown} ${section.lossy}`,
		),
	).toEqual([
		"h # Plan B false",
		"q1 > One false",
		"q2 > Two ’s false",
		"m Ask @Avery true",
	]);
	expect(canvasSections(html, "Another title")[0]?.id).toBe("t");
});

test("writes the sections back as one markdown document", () => {
	expect(canvasMarkdown(canvasSections(HTML))).toBe(
		[
			"# Launch checklist",
			"",
			"- Write the announcement",
			"- Tell support",
			"",
			"Owner: Satya & Blake",
			"",
			"## Risks",
			"",
			"1. Pricing page is not updated",
			"2. **Support** macro is missing",
			"",
			"- [ ] Draft the email",
			"- [x] Book the room",
			"",
			"> Quote line",
			"",
			"```\ncode line\n```",
			"",
			"See [the plan](https://example.com) and `inline`.",
		].join("\n"),
	);
});
