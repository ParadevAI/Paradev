import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline } from "./Sparkline";

const pointsOf = (markup: string) =>
	markup.match(/points="([^"]*)"/)?.[1]?.split(" ");

describe("Sparkline", () => {
	test("draws the highest point at the top and zero at the bottom", () => {
		const markup = renderToStaticMarkup(
			<Sparkline title="t" points={[0, 10]} width={11} height={11} />,
		);
		expect(pointsOf(markup)).toEqual(["1,10", "10,1"]);
	});

	test("names the chart for a screen reader", () => {
		const markup = renderToStaticMarkup(
			<Sparkline title="Usage" points={[1]} />,
		);
		expect(markup).toContain("<title>Usage</title>");
		expect(markup).toContain('aria-label="Usage"');
	});

	test("an all-zero series is a flat line at the bottom", () => {
		const markup = renderToStaticMarkup(
			<Sparkline title="t" points={[0, 0]} width={11} height={11} />,
		);
		expect(pointsOf(markup)).toEqual(["1,10", "10,10"]);
	});
});
