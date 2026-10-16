import type { Editor } from "@tiptap/react";
import { useMemo, useRef, useState } from "react";
import type { LinkDraft } from "../../components/LinkPopover";
import type { GmailEmailView } from "../../types";
import { draftContent, type SendInput } from "../../utils/emailBody";
import { gmailEditorExtensions } from "../../utils/gmailEditor";
import {
	type AttachmentChange,
	useDraftAttachments,
} from "../useDraftAttachments";

/** The body the composer opens with: the draft, then the From address's Gmail signature unless the draft already has it, its lines kept together as Gmail shows them. */
export function withSignature(content: string, signature: string): string {
	const text = (html: string) =>
		html.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
	const plain = text(signature);
	if (!plain || text(content).includes(plain)) return content;
	const lines = signature
		.replace(/<\/(div|p)>\s*<(div|p)\b[^>]*>/gi, "<br>")
		.replace(/<\/?(div|p)\b[^>]*>/gi, "");
	return `${content}<p></p><p>-- <br>${lines}</p>`;
}

/** What a Gmail composer shares: the editor, From, formatting, links, files, and the send input. */
export function useGmailCompose({
	draft,
	sendAs,
	onSaveDraft,
	failure,
}: {
	draft: GmailEmailView["draft"];
	sendAs: GmailEmailView["sendAs"];
	onSaveDraft?: (change: AttachmentChange) => void;
	failure: string | null;
}) {
	const editor = useRef<Editor | null>(null);
	const [from, setFrom] = useState(draft.from);
	const [formatting, setFormatting] = useState(false);
	const [link, setLink] = useState<LinkDraft | null>(null);
	const [scheduling, setScheduling] = useState(false);
	const openLink = useRef<() => void>(() => undefined);
	const extensions = useMemo(
		() => gmailEditorExtensions(() => openLink.current()),
		[],
	);
	const signature =
		sendAs.find((alias) => alias.email === from)?.signature ?? "";
	const [content] = useState(() =>
		withSignature(draftContent(draft), signature),
	);
	const files = useDraftAttachments(draft.attachments, onSaveDraft, failure);

	openLink.current = () => {
		const current = editor.current;
		if (!current) return;
		const { from: start, to } = current.state.selection;
		const inText = current.state.doc.resolve(start).parent.isTextblock;
		const at = current.view.coordsAtPos(inText ? start : start + 1);
		setLink({
			text: current.state.doc.textBetween(start, to, " "),
			href: (current.getAttributes("link").href as string | undefined) ?? "",
			anchor: new DOMRect(at.left, at.top, 0, at.bottom - at.top),
		});
	};
	const saveLink = (next: { text: string; href: string }) => {
		const current = editor.current;
		setLink(null);
		if (!current) return;
		const { from: start, to } = current.state.selection;
		current
			.chain()
			.focus()
			.insertContentAt(
				{ from: start, to },
				{
					type: "text",
					text: next.text,
					marks: [{ type: "link", attrs: { href: next.href } }],
				},
			)
			.run();
	};

	return {
		editor,
		extensions,
		content,
		from,
		setFrom,
		formatting,
		toggleFormatting: () => setFormatting((open) => !open),
		link,
		openLink: () => openLink.current(),
		saveLink,
		cancelLink: () => setLink(null),
		scheduling,
		setScheduling,
		files,
		withFrom: (input: SendInput): SendInput => ({ ...input, from }),
	};
}
