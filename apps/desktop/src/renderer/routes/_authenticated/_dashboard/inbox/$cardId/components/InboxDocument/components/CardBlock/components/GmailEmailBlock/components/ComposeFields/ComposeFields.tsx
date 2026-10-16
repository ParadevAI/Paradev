import { useLingui } from "@lingui/react/macro";
import type { AnyExtension, Editor } from "@tiptap/react";
import { type MutableRefObject, useState } from "react";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import type { GmailAddress } from "../../types";
import { GMAIL_EDITOR_FEATURES } from "../../utils/gmailEditor";
import { RecipientField } from "../RecipientField";

interface CopyFields {
	cc: GmailAddress[];
	onCc: (next: GmailAddress[]) => void;
	bcc: GmailAddress[];
	onBcc: (next: GmailAddress[]) => void;
}

interface ComposeFieldsProps {
	to: GmailAddress[];
	onTo: (next: GmailAddress[]) => void;
	/** Absent where the message takes only direct recipients. */
	copies?: CopyFields;
	subject: string;
	onSubject: (next: string) => void;
	known: GmailAddress[];
	/** The body the editor opens with, as HTML. */
	content: string;
	editorHandle: MutableRefObject<Editor | null>;
	extensions?: AnyExtension[];
	onModEnter?: () => void;
	onBodyChange?: () => void;
}

/** The fields of Gmail's New Message window: recipients, subject, and the body sized to its words. */
export function ComposeFields({
	to,
	onTo,
	copies,
	subject,
	onSubject,
	known,
	content,
	editorHandle,
	extensions,
	onModEnter,
	onBodyChange,
}: ComposeFieldsProps) {
	const { t } = useLingui();
	const [showCc, setShowCc] = useState(Boolean(copies?.cc.length));
	const [showBcc, setShowBcc] = useState(Boolean(copies?.bcc.length));
	return (
		<>
			<RecipientField
				label={t({ message: "To" })}
				value={to}
				onChange={onTo}
				known={known}
				trailing={
					copies && (
						<span className="flex shrink-0 gap-2 text-[13px] text-muted-foreground">
							{!showCc && (
								<button
									type="button"
									className="hover:text-foreground hover:underline"
									onClick={() => setShowCc(true)}
								>
									{t({ message: "Cc" })}
								</button>
							)}
							{!showBcc && (
								<button
									type="button"
									className="hover:text-foreground hover:underline"
									onClick={() => setShowBcc(true)}
								>
									{t({ message: "Bcc" })}
								</button>
							)}
						</span>
					)
				}
			/>
			{copies && showCc && (
				<RecipientField
					label={t({ message: "Cc" })}
					value={copies.cc}
					onChange={copies.onCc}
					known={known}
				/>
			)}
			{copies && showBcc && (
				<RecipientField
					label={t({ message: "Bcc" })}
					value={copies.bcc}
					onChange={copies.onBcc}
					known={known}
				/>
			)}
			<input
				value={subject}
				onChange={(event) =>
					onSubject(event.target.value.replace(/[\r\n]/g, " "))
				}
				placeholder={t({ message: "Subject" })}
				aria-label={t({ message: "Subject" })}
				className="h-9 w-full border-b border-border bg-transparent px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
			/>
			<MarkdownEditor
				content={content}
				editorHandle={editorHandle}
				extensions={extensions}
				onModEnter={onModEnter}
				onChange={onBodyChange}
				features={GMAIL_EDITOR_FEATURES}
				className="px-3 pt-2"
				editorClassName="min-h-16 text-[14px] leading-relaxed [&_p]:my-0"
			/>
		</>
	);
}
