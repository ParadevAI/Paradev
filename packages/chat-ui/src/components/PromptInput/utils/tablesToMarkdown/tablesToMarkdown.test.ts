import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

const { tablesToMarkdown } = await import("./tablesToMarkdown");

const paragraphs = (html: string | null) =>
	Array.from(
		new DOMParser()
			.parseFromString(html ?? "", "text/html")
			.querySelectorAll("p"),
	).map((p) => p.textContent);

describe("tablesToMarkdown", () => {
	test("a pasted table becomes markdown table rows", () => {
		const html =
			"<p>Status:</p><table><tr><th>Name</th><th>State</th></tr><tr><td>api</td><td>green</td></tr></table>";
		const rows = paragraphs(tablesToMarkdown(html));
		expect(rows[0]).toBe("Status:");
		expect(rows.slice(1).every((row) => row?.startsWith("|"))).toBe(true);
		expect(rows.join("\n")).toContain("| api | green |");
	});

	test("html without a table is left to the normal paste", () => {
		expect(tablesToMarkdown("<ul><li>a</li></ul>")).toBeNull();
	});
});
