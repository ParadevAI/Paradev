import { useLingui } from "@lingui/react/macro";
import type { Editor } from "@tiptap/react";
import { useMemo, useRef, useState } from "react";
import { textToLines } from "../../utils/emailBody";
import { ComposeFields } from "../ComposeFields";

export interface GmailDraftValue {
	to: string[];
	subject: string;
	/** Plain text. */
	body: string;
}

interface GmailDraftFormProps {
	value: GmailDraftValue;
	onChange: (next: GmailDraftValue) => void;
	/** The address the draft is made in. */
	from: string | null;
	disabled?: boolean;
}

const NOBODY_KNOWN: never[] = [];

/** Gmail's New Message window as a form: it reports what is written and sends nothing. */
export function GmailDraftForm({
	value,
	onChange,
	from,
	disabled,
}: GmailDraftFormProps) {
	const { t } = useLingui();
	const editor = useRef<Editor | null>(null);
	const [content] = useState(() => textToLines(value.body));
	const latest = useRef(value);
	latest.current = value;
	const to = useMemo(
		() => value.to.map((email) => ({ name: null, email })),
		[value.to],
	);
	return (
		<div
			inert={disabled}
			className="overflow-hidden rounded-xl border border-border bg-background"
		>
			<div className="flex h-10 items-center bg-muted/70 px-4 text-[14px] font-medium text-foreground">
				{t({ message: "New Message" })}
			</div>
			{from && (
				<div className="flex h-9 items-center gap-2 border-b border-border px-3 text-[13px]">
					<span className="text-muted-foreground">
						{t({ message: "From" })}
					</span>
					<span className="min-w-0 truncate text-foreground">{from}</span>
				</div>
			)}
			<ComposeFields
				to={to}
				onTo={(next) =>
					onChange({
						...latest.current,
						to: next.map((address) => address.email),
					})
				}
				subject={value.subject}
				onSubject={(subject) => onChange({ ...latest.current, subject })}
				known={NOBODY_KNOWN}
				content={content}
				editorHandle={editor}
				onBodyChange={() =>
					onChange({
						...latest.current,
						body: editor.current?.getText({ blockSeparator: "\n" }) ?? "",
					})
				}
			/>
			<div className="h-2" />
		</div>
	);
}
