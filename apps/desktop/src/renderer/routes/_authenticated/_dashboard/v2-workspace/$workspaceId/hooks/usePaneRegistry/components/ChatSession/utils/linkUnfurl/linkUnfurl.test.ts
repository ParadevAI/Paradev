import { describe, expect, test } from "bun:test";
import { unfurlLink } from "./linkUnfurl";

const WEB = "https://app.superset.sh";

describe("unfurlLink", () => {
	test.each([
		[
			"https://mail.google.com/mail/u/0/#drafts/abc",
			{ icon: { kind: "plugin", name: "gmail" } },
		],
		[
			"https://github.com/superset-sh/superset/pull/8298",
			{
				icon: { kind: "plugin", name: "github" },
				label: "superset-sh/superset#8298",
			},
		],
		[
			"https://linear.app/superset-sh/issue/SUPER-2617/create-a-mechanism",
			{ icon: { kind: "plugin", name: "linear" }, label: "SUPER-2617" },
		],
		[
			"https://docs.google.com/spreadsheets/d/1/edit",
			{ icon: { kind: "plugin", name: "google-sheets" } },
		],
		[
			"https://acme.slack.com/archives/C1/p2",
			{ icon: { kind: "plugin", name: "slack" } },
		],
		[
			"https://example.com/files/Side%20Letter.pdf",
			{
				icon: { kind: "file", fileName: "Side Letter.pdf" },
				label: "Side Letter.pdf",
			},
		],
		[
			"https://app.superset.sh/page/plugin-page-xy56xt",
			{
				icon: { kind: "plugin", name: "superset" },
				label: "plugin-page-xy56xt",
			},
		],
	])("%s", (href, expected) => {
		expect(unfurlLink(href, false, WEB)).toEqual(expected as never);
	});

	test("unfurls a local file path by its name", () => {
		expect(unfurlLink("/tmp/out/report.pdf", true, WEB)).toEqual({
			icon: { kind: "file", fileName: "report.pdf" },
			label: "report.pdf",
		});
	});

	test.each([
		["src/app.ts:12", "app.ts", "app.ts:12"],
		["app.ts:12:4", "app.ts", "app.ts:12:4"],
		["/Users/me/x.ts#L3", "x.ts", "x.ts#L3"],
		["src/app.ts#L12-L20", "app.ts", "app.ts#L12-L20"],
	])("counts %s as a file and keeps its line position", (href, fileName, label) => {
		expect(unfurlLink(href, true, WEB)).toEqual({
			icon: { kind: "file", fileName },
			label,
		});
	});

	test("does not take a dot directory for a file", () => {
		expect(unfurlLink(".git/", true, WEB)).toBe(null);
		expect(unfurlLink("repo/.github", true, WEB)).toBe(null);
	});

	test("does not take a version number for a file extension", () => {
		expect(unfurlLink("https://example.com/releases/1.34.0", false, WEB)).toBe(
			null,
		);
		expect(unfurlLink("https://example.com/a/clip.mp4", false, WEB)).toEqual({
			icon: { kind: "file", fileName: "clip.mp4" },
			label: "clip.mp4",
		});
		expect(unfurlLink("/tmp/backup.7z", true, WEB)?.label).toBe("backup.7z");
	});

	test("leaves plain web pages and other schemes alone", () => {
		expect(unfurlLink("https://example.com/docs/intro.html", false, WEB)).toBe(
			null,
		);
		expect(unfurlLink("https://example.com/", false, WEB)).toBe(null);
		expect(unfurlLink("mailto:a@b.co", false, WEB)).toBe(null);
		expect(unfurlLink("https://github.com.evil.io/x", false, WEB)).toBe(null);
	});
});
