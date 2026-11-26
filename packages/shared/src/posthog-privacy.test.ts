import { describe, expect, test } from "bun:test";
import {
	dropExceptionEvents,
	maskRecordedInput,
	maskRecordedText,
	maskRecordingEvents,
	POSTHOG_PRIVACY_CONFIG,
} from "./posthog-privacy";

function elementInside(unmasked: boolean): HTMLElement {
	return {
		closest: (selector: string) =>
			unmasked && selector === "[data-ph-unmask]" ? {} : null,
	} as unknown as HTMLElement;
}

function snapshot(events: unknown[]) {
	return { event: "$snapshot", properties: { $snapshot_data: events } };
}

function fullSnapshot(childNodes: unknown[]) {
	return snapshot([{ type: 2, data: { node: { childNodes } } }]);
}

describe("maskRecordedText", () => {
	test("masks text outside unmasked chrome", () => {
		expect(maskRecordedText("fix login bug", elementInside(false))).toBe(
			"*** ***** ***",
		);
	});

	test("keeps text inside unmasked chrome", () => {
		expect(maskRecordedText("Settings", elementInside(true))).toBe("Settings");
	});
});

describe("maskRecordingEvents", () => {
	test("drops console log events", () => {
		const mutation = { type: 3, data: { source: 1 } };
		const capture = snapshot([
			{
				type: 6,
				data: {
					plugin: "rrweb/console@1",
					payload: { level: "log", payload: ['"/Users/me/notes"'] },
				},
			},
			mutation,
		]);

		expect(POSTHOG_PRIVACY_CONFIG.enable_recording_console_log).toBe(false);
		expect(maskRecordingEvents(capture)).toEqual(snapshot([mutation]));
	});

	test("masks every attribute value except structural ones", () => {
		const capture = fullSnapshot([
			{
				tagName: "div",
				attributes: {
					"data-value": "/Users/me/project/main.ts",
					id: "my-branch",
					name: "workspace",
					value: "draft",
					title: "my workspace",
					class: "row",
					role: "option",
					"aria-expanded": "false",
					"data-state": "open",
					"data-selected": "true",
				},
			},
		]);

		expect(maskRecordingEvents(capture)).toEqual(
			fullSnapshot([
				{
					tagName: "div",
					attributes: {
						"data-value": "***",
						id: "***",
						name: "***",
						value: "***",
						title: "***",
						class: "row",
						role: "option",
						"aria-expanded": "false",
						"data-state": "open",
						"data-selected": "true",
					},
				},
			]),
		);
	});

	test("keeps what the replay needs to render", () => {
		const capture = fullSnapshot([
			{
				tagName: "link",
				attributes: { rel: "stylesheet", href: "/styles.css" },
			},
			{ tagName: "a", attributes: { href: "https://x.dev/b/main" } },
			{
				tagName: "div",
				attributes: {
					style: "color: red; background: url(https://x.dev/me.png)",
					_cssText: "body { margin: 0 }",
					rr_width: "20px",
				},
			},
		]);

		expect(maskRecordingEvents(capture)).toEqual(
			fullSnapshot([
				{
					tagName: "link",
					attributes: { rel: "stylesheet", href: "/styles.css" },
				},
				{ tagName: "a", attributes: { href: "***" } },
				{
					tagName: "div",
					attributes: {
						style: "color: red; background: none",
						_cssText: "body { margin: 0 }",
						rr_width: "20px",
					},
				},
			]),
		);
	});

	test("does not record image addresses", () => {
		const capture = snapshot([
			{
				type: 3,
				data: {
					source: 0,
					adds: [
						{
							node: {
								tagName: "img",
								attributes: {
									src: "https://github.com/someone.png",
									srcset: "/file-icons/typescript.svg 1x",
								},
							},
						},
					],
				},
			},
		]);

		expect(POSTHOG_PRIVACY_CONFIG.session_recording.blockSelector).toBe("img");
		expect(maskRecordingEvents(capture)).toEqual(
			snapshot([
				{
					type: 3,
					data: {
						source: 0,
						adds: [
							{
								node: {
									tagName: "img",
									attributes: { src: "***", srcset: "***" },
								},
							},
						],
					},
				},
			]),
		);
	});

	test("records input values with a fixed length", () => {
		const capture = snapshot([
			{ type: 3, data: { source: 5, text: "*", isChecked: false } },
			{
				type: 3,
				data: { source: 5, text: "****************", isChecked: false },
			},
		]);

		expect(maskRecordedInput()).toBe("***");
		expect(maskRecordingEvents(capture)).toEqual(
			snapshot([
				{ type: 3, data: { source: 5, text: "***", isChecked: false } },
				{ type: 3, data: { source: 5, text: "***", isChecked: false } },
			]),
		);
	});

	test("masks attributes inside unmasked chrome", () => {
		const capture = fullSnapshot([
			{
				tagName: "span",
				attributes: { "data-ph-unmask": "" },
				childNodes: [{ tagName: "span", attributes: { title: "my-branch" } }],
			},
		]);

		expect(maskRecordingEvents(capture)).toEqual(
			fullSnapshot([
				{
					tagName: "span",
					attributes: { "data-ph-unmask": "" },
					childNodes: [{ tagName: "span", attributes: { title: "***" } }],
				},
			]),
		);
	});

	test("masks attribute changes in mutations", () => {
		const capture = snapshot([
			{
				type: 3,
				data: {
					source: 0,
					attributes: [
						{ attributes: { "aria-label": "main.ts", title: null } },
					],
				},
			},
		]);

		expect(maskRecordingEvents(capture)).toEqual(
			snapshot([
				{
					type: 3,
					data: {
						source: 0,
						attributes: [{ attributes: { "aria-label": "***", title: null } }],
					},
				},
			]),
		);
	});
});

describe("dropExceptionEvents", () => {
	test("drops exception events and keeps others", () => {
		expect(dropExceptionEvents({ event: "$exception" })).toBeNull();
		expect(dropExceptionEvents({ event: "$pageview" })).toEqual({
			event: "$pageview",
		});
	});
});
