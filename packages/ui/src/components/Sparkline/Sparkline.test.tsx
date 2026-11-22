import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline } from "./Sparkline";

const render = (props: Partial<Parameters<typeof Sparkline>[0]>) =>
	renderToStaticMarkup(<Sparkline title="t" points={[0, 10]} {...props} />);
const pathOf = (markup: string) => markup.match(/ d="([^"]*)"/)?.[1];

describe("Sparkline", () => {
	test("keeps 2 px above the peak and below the baseline", () => {
		expect(pathOf(render({ width: 10, height: 10 }))).toBe("M0,8L10,2");
	});

	test("is 80 by 20, fills its cell up to 80 px, and keeps its stroke width", () => {
		const markup = render({});
		expect(markup).toContain('viewBox="0 0 80 20"');
		expect(markup).toContain('preserveAspectRatio="none"');
		expect(markup).toContain("width:100%;max-width:80px");
		expect(markup).toContain('vector-effect="non-scaling-stroke"');
	});

	test("joins the points with a curve, not straight segments", () => {
		expect(pathOf(render({ points: [0, 10, 0, 10] }))).toContain("C");
	});

	test("names the chart for a screen reader", () => {
		const markup = render({ title: "Usage" });
		expect(markup).toContain("<title>Usage</title>");
		expect(markup).toContain('aria-label="Usage"');
	});

	test("a single point and equal values are flat lines", () => {
		expect(pathOf(render({ points: [5], width: 10, height: 10 }))).toBe(
			"M0,2L10,2",
		);
		expect(pathOf(render({ points: [0, 0], width: 10, height: 10 }))).toBe(
			"M0,8L10,8",
		);
	});

	test("draws nothing for no points", () => {
		expect(render({ points: [] })).toBe("");
	});
});
