import { describe, expect, test } from "bun:test";
import { emailHtmlFromEditor, textToLines } from "./emailBody";

describe("textToLines", () => {
	test("a plain-text draft opens line by line, a blank line kept, markup left as typed", () => {
		expect(textToLines("Hi Avery,\r\n\r\nUse *bold* <b>here</b>\n- one")).toBe(
			"<p>Hi Avery,</p><p></p><p>Use *bold* &lt;b&gt;here&lt;/b&gt;</p><p>- one</p>",
		);
	});
});

describe("emailHtmlFromEditor", () => {
	test("writes Gmail's lines: a div each, a blank line as an empty div, tight lists, no editor attributes", () => {
		expect(
			emailHtmlFromEditor(
				'<p class="x">Hi,</p><p></p><p style="margin-left: 40px;">Grab <strong>trail mix</strong>:</p><ul data-type="list"><li><p>Trail mix</p></li><li><p>Water</p></li></ul><p></p>',
			),
		).toBe(
			'<div>Hi,</div><div><br></div><div style="margin-left: 40px;">Grab <strong>trail mix</strong>:</div><ul><li>Trail mix</li><li>Water</li></ul>',
		);
	});
});
