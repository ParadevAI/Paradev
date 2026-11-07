import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { SOCIAL } from "@superset/shared/constants";
import matter from "gray-matter";
import { renderToStaticMarkup } from "react-dom/server";
import { faqAnswerText, renderFaqAnswer } from "./faqSocialLinks";

describe("faqSocialLinks", () => {
	test("renders social tokens as links labeled with the handle", () => {
		const html = renderToStaticMarkup(
			<p>{renderFaqAnswer("On X we're {x}, and {x-former} points to it.")}</p>,
		);
		expect(html).toContain(`href="${SOCIAL.X.url}"`);
		expect(html).toContain(`>${SOCIAL.X.handle}</a>`);
		expect(html).toContain(`href="${SOCIAL.X_FORMER.url}"`);
		expect(html).not.toContain("{x}");
	});

	test("gives structured data the handles as text", () => {
		expect(faqAnswerText("On YouTube we're {youtube}.")).toBe(
			`On YouTube we're ${SOCIAL.YOUTUBE.handle}.`,
		);
	});

	test("leaves an unknown token visible", () => {
		expect(faqAnswerText("Find us on {mastodon}.")).toBe(
			"Find us on {mastodon}.",
		);
	});

	test("every blog FAQ answer uses only known tokens", () => {
		const blogDir = path.join(
			import.meta.dir,
			"../../../../../../../content/blog",
		);
		for (const file of fs.readdirSync(blogDir)) {
			const { data } = matter(
				fs.readFileSync(path.join(blogDir, file), "utf8"),
			);
			for (const { answer } of data.faq ?? []) {
				expect({ file, text: faqAnswerText(answer) }).not.toMatchObject({
					text: expect.stringMatching(/\{[a-z-]+\}/),
				});
			}
		}
	});
});
