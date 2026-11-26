import { describe, expect, test } from "bun:test";
import {
	maskRecordedInput,
	maskRecordedText,
	maskRecordingEvents,
	POSTHOG_PRIVACY_CONFIG,
	scrubExceptionPaths,
	stripLinkTargets,
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

describe("maskRecordingEvents styles and links", () => {
	test("drops font families from inline styles", () => {
		const capture = fullSnapshot([
			{
				tagName: "div",
				attributes: { style: 'font-family: "My Font"; color: red;' },
			},
		]);

		expect(maskRecordingEvents(capture)).toEqual(
			fullSnapshot([{ tagName: "div", attributes: { style: " color: red;" } }]),
		);
	});

	test("sanitizes style changes sent as objects", () => {
		const capture = snapshot([
			{
				type: 3,
				data: {
					source: 0,
					attributes: [
						{
							attributes: {
								style: {
									"background-image": "url(https://x.dev/me.png)",
									"font-family": "My Font",
									color: ["red", "important"],
									opacity: false,
								},
							},
						},
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
						attributes: [
							{
								attributes: {
									style: {
										"background-image": "none",
										color: ["red", "important"],
										opacity: false,
									},
								},
							},
						],
					},
				},
			]),
		);
	});

	test("keeps link targets only for stylesheets", () => {
		const capture = fullSnapshot([
			{
				tagName: "link",
				attributes: { rel: "icon", href: "https://x.dev/me" },
			},
		]);

		expect(maskRecordingEvents(capture)).toEqual(
			fullSnapshot([
				{ tagName: "link", attributes: { rel: "icon", href: "***" } },
			]),
		);
	});
});

describe("stripLinkTargets", () => {
	test("removes clicked link addresses from events", () => {
		const capture: { event: string; properties: Record<string, unknown> } = {
			event: "$autocapture",
			properties: {
				$event_type: "click",
				$external_click_url: "https://x.dev/pull/1?scope=token",
				$elements_chain:
					'a.link:attr__href="https://x.dev/pull/1?scope=token"href="https://x.dev/pull/1?scope=token"nth-child="1"nth-of-type="1";div:attr__data-href="#/a"nth-child="2"',
			},
		};

		expect(stripLinkTargets(capture)).toEqual({
			event: "$autocapture",
			properties: {
				$event_type: "click",
				$elements_chain:
					'a.link:nth-child="1"nth-of-type="1";div:attr__data-href="#/a"nth-child="2"',
			},
		});
	});
});

describe("scrubExceptionPaths", () => {
	test("replaces home directories in exception messages and frames", () => {
		const capture = {
			event: "$exception",
			properties: {
				$exception_level: "error",
				$exception_list: [
					{
						type: "Error",
						value: "ENOENT: /Users/jane/notes.md and C:\\Users\\jane\\a.txt",
						stacktrace: {
							type: "raw",
							frames: [
								{
									filename:
										"http://localhost:9045/@fs/Users/jane/repo/src/app.ts",
									lineno: 3,
								},
								{ filename: "file:///home/jane/app/index.js" },
								{
									filename: "file:///C:/Users/jane/app/main.js",
									abs_path: "/Users/jane/app/main.js",
								},
							],
						},
					},
				],
			},
		};

		expect(scrubExceptionPaths(capture)).toEqual({
			event: "$exception",
			properties: {
				$exception_level: "error",
				$exception_list: [
					{
						type: "Error",
						value: "ENOENT: ~/notes.md and ~\\a.txt",
						stacktrace: {
							type: "raw",
							frames: [
								{
									filename: "http://localhost:9045/@fs~/repo/src/app.ts",
									lineno: 3,
								},
								{ filename: "file://~/app/index.js" },
								{
									filename: "file:///~/app/main.js",
									abs_path: "~/app/main.js",
								},
							],
						},
					},
				],
			},
		});
	});
});
