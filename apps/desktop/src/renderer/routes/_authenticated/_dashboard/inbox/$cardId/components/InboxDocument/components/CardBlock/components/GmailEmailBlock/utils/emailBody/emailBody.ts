import type { Editor } from "@tiptap/react";
import type { GmailAddress } from "../../types";
import { formatRecipient } from "../addresses";
import { draftEditorHtml } from "../emailHtml";

export interface SendInput {
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	html: string;
	text: string;
	attribution?: string;
	from?: string;
	mode?: "reply" | "forward";
	of?: string;
}

/** The editor's HTML as Gmail writes mail: a div per line, a blank line as an empty one, tight list items, no editor attributes. */
export function emailHtmlFromEditor(html: string): string {
	return html
		.replace(/\s(class|data-[a-z-]+)="[^"]*"/g, "")
		.replace(/<li><p>([\s\S]*?)<\/p><\/li>/g, "<li>$1</li>")
		.replace(/(<p><\/p>)+$/, "")
		.replace(/<p><\/p>/g, "<div><br></div>")
		.replace(/<p(\s[^>]*)?>/g, "<div$1>")
		.replace(/<\/p>/g, "</div>");
}

/** What the card's send action takes: the recipients as written and the body as HTML and text. */
export function sendInput(
	editor: Editor,
	fields: {
		to: GmailAddress[];
		cc: GmailAddress[];
		bcc: GmailAddress[];
		subject: string;
		attribution?: string;
	},
): SendInput {
	return {
		to: fields.to.map(formatRecipient),
		cc: fields.cc.map(formatRecipient),
		bcc: fields.bcc.map(formatRecipient),
		subject: fields.subject,
		html: emailHtmlFromEditor(editor.getHTML()),
		text: editor.getText({ blockSeparator: "\n" }),
		...(fields.attribution ? { attribution: fields.attribution } : {}),
	};
}

/** A plain-text draft as editor lines, as Gmail shows it: one line each, a blank line kept empty. */
export function textToLines(text: string): string {
	const escaped = (line: string) =>
		line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	return text
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => `<p>${escaped(line)}</p>`)
		.join("");
}

/** What the composer opens with: the draft's HTML when it has some, else its text kept literal. */
export function draftContent(draft: {
	body: string;
	html: string | null;
}): string {
	const html = draft.html ? draftEditorHtml(draft.html) : "";
	return html || textToLines(draft.body);
}
