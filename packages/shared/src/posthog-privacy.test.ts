import { describe, expect, test } from "bun:test";
import { maskRecordedText, maskRecordingAttributes } from "./posthog-privacy";

function elementInside(unmasked: boolean): HTMLElement {
	return {
		closest: (selector: string) =>
			unmasked && selector === "[data-ph-unmask]" ? {} : null,
	} as unknown as HTMLElement;
}

function snapshot(events: unknown[]) {
	return { event: "$snapshot", properties: { $snapshot_data: events } };
}

describe("maskRecordedText", () => {
	test("masks text outside unmasked chrome", () => {
		expect(maskRecordedText("fix login bug", elementInside(false))).toBe(
			"*** ***** ***",
		);
	});

	test("masks text with no element", () => {
		expect(maskRecordedText("secret")).toBe("******");
	});

	test("keeps text inside unmasked chrome", () => {
		expect(maskRecordedText("Settings", elementInside(true))).toBe("Settings");
	});
});

describe("maskRecordingAttributes", () => {
	test("masks user attributes in a full snapshot but keeps unmasked subtrees", () => {
		const capture = snapshot([
			{
				type: 2,
				data: {
					node: {
						childNodes: [
							{
								attributes: { title: "my workspace", class: "row" },
								childNodes: [{ attributes: { alt: "avatar of kiet" } }],
							},
							{
								attributes: { "data-ph-unmask": "", "aria-label": "Tasks" },
							},
						],
					},
				},
			},
		]);

		expect(maskRecordingAttributes(capture)).toEqual(
			snapshot([
				{
					type: 2,
					data: {
						node: {
							childNodes: [
								{
									attributes: { title: "** *********", class: "row" },
									childNodes: [{ attributes: { alt: "****** ** ****" } }],
								},
								{
									attributes: { "data-ph-unmask": "", "aria-label": "Tasks" },
								},
							],
						},
					},
				},
			]),
		);
	});

	test("masks added nodes and attribute changes in mutations", () => {
		const capture = snapshot([
			{
				type: 3,
				data: {
					source: 0,
					adds: [{ node: { attributes: { placeholder: "draft notes" } } }],
					attributes: [
						{ attributes: { "aria-label": "main.ts", title: null } },
					],
				},
			},
		]);

		expect(maskRecordingAttributes(capture)).toEqual(
			snapshot([
				{
					type: 3,
					data: {
						source: 0,
						adds: [{ node: { attributes: { placeholder: "***** *****" } } }],
						attributes: [
							{ attributes: { "aria-label": "*******", title: null } },
						],
					},
				},
			]),
		);
	});

	test("masks link targets but keeps stylesheet and fragment references", () => {
		const capture = snapshot([
			{
				type: 2,
				data: {
					node: {
						childNodes: [
							{ tagName: "a", attributes: { href: "https://x.dev/b/main" } },
							{ tagName: "link", attributes: { href: "/styles.css" } },
						],
					},
				},
			},
			{
				type: 3,
				data: {
					source: 0,
					attributes: [
						{ attributes: { href: "https://x.dev/pull/1" } },
						{ attributes: { href: "#icon-file" } },
					],
				},
			},
		]);

		expect(maskRecordingAttributes(capture)).toEqual(
			snapshot([
				{
					type: 2,
					data: {
						node: {
							childNodes: [
								{ tagName: "a", attributes: { href: "********************" } },
								{ tagName: "link", attributes: { href: "/styles.css" } },
							],
						},
					},
				},
				{
					type: 3,
					data: {
						source: 0,
						attributes: [
							{ attributes: { href: "********************" } },
							{ attributes: { href: "#icon-file" } },
						],
					},
				},
			]),
		);
	});

	test("leaves other events untouched", () => {
		const event = { type: 2, data: { node: { attributes: { title: "x" } } } };
		const capture = {
			event: "$autocapture",
			properties: { $snapshot_data: [event] },
		};

		maskRecordingAttributes(capture);

		expect(event.data.node.attributes.title).toBe("x");
	});
});
