import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { AttachmentChange } from "../../hooks/useDraftAttachments";
import { useGmailCompose } from "../../hooks/useGmailCompose";
import type { GmailAddress, GmailEmailView } from "../../types";
import { type SendInput, sendInput } from "../../utils/emailBody";
import { BlockedFilesBar } from "../BlockedFilesBar";
import { ComposeAttachments } from "../ComposeAttachments";
import { ComposeFields } from "../ComposeFields";
import { FileDropZone } from "../FileDropZone";
import { FormattingBar } from "../FormattingBar";
import { FromField } from "../FromField";
import { LinkPopover } from "../LinkPopover";
import { ScheduleSendDialog } from "../ScheduleSendDialog";
import { SendFooter } from "../SendFooter";

interface ComposeWindowProps {
	draft: GmailEmailView["draft"];
	sendAs: GmailEmailView["sendAs"];
	known: GmailAddress[];
	gmailUrl: string;
	pending: boolean;
	failure: string | null;
	onSend: (input: SendInput & AttachmentChange) => void;
	/** Absent when there is no Gmail draft behind the composer: files then go with Send. */
	onSaveDraft?: (input: SendInput & AttachmentChange) => void;
	onSchedule?: (input: SendInput & AttachmentChange, at: Date) => void;
	onRemoveBlockedAndSend: (input: SendInput & AttachmentChange) => void;
	onDiscard: () => void;
}

/** Gmail's New Message window: From when there are aliases, recipients, subject, the body sized to its words, files, and Gmail's bottom bar. */
export function ComposeWindow({
	draft,
	sendAs,
	known,
	gmailUrl,
	pending,
	failure,
	onSend,
	onSaveDraft,
	onSchedule,
	onRemoveBlockedAndSend,
	onDiscard,
}: ComposeWindowProps) {
	const { t } = useLingui();
	const [to, setTo] = useState(draft.to);
	const [cc, setCc] = useState(draft.cc);
	const [bcc, setBcc] = useState(draft.bcc);
	const [subject, setSubject] = useState(draft.subject);
	const fields = (): SendInput | null =>
		compose.editor.current
			? compose.withFrom(
					sendInput(compose.editor.current, { to, cc, bcc, subject }),
				)
			: null;
	const compose = useGmailCompose({
		draft,
		sendAs,
		failure,
		onSaveDraft:
			onSaveDraft &&
			((change) => {
				const input = fields();
				if (input) onSaveDraft({ ...input, ...change });
			}),
	});
	const { files } = compose;
	const hasRecipients = to.length + cc.length + bcc.length > 0;
	const blockedReason =
		files.blocked.length > 0
			? t({ message: "Gmail won't send blocked files" })
			: files.busy
				? t({ message: "Wait for the files to finish attaching" })
				: null;
	const send = () => {
		const input = fields();
		if (!input || pending || !hasRecipients || blockedReason) return;
		onSend({ ...input, ...files.withoutBlocked() });
	};

	return (
		<FileDropZone
			onDrop={files.add}
			className="m-4 overflow-hidden rounded-xl border border-border bg-background shadow-md"
		>
			<div className="flex h-10 items-center bg-muted/70 px-4 text-[14px] font-medium text-foreground">
				{t({ message: "New Message" })}
			</div>
			<FromField
				sendAs={sendAs}
				value={compose.from}
				onChange={compose.setFrom}
			/>
			<ComposeFields
				to={to}
				onTo={setTo}
				copies={{ cc, onCc: setCc, bcc, onBcc: setBcc }}
				subject={subject}
				onSubject={setSubject}
				known={known}
				content={compose.content}
				editorHandle={compose.editor}
				extensions={compose.extensions}
				onModEnter={send}
			/>
			<ComposeAttachments files={files.files} onRemove={files.remove} />
			{files.blocked.length > 0 && (
				<BlockedFilesBar
					names={files.blocked.map((file) => file.filename)}
					pending={pending}
					onRemoveAndSend={() => {
						const input = fields();
						if (input)
							onRemoveBlockedAndSend({ ...input, ...files.withoutBlocked() });
					}}
				/>
			)}
			{compose.formatting && <FormattingBar editor={compose.editor.current} />}
			<SendFooter
				canSend={hasRecipients}
				blockedReason={blockedReason}
				pending={pending}
				failure={failure}
				gmailUrl={gmailUrl}
				formatting={compose.formatting}
				onSend={send}
				onSchedule={onSchedule && (() => compose.setScheduling(true))}
				onToggleFormatting={compose.toggleFormatting}
				onAttach={files.add}
				onLink={compose.openLink}
				onDiscard={onDiscard}
			/>
			<LinkPopover
				initial={compose.link}
				onSave={compose.saveLink}
				onCancel={compose.cancelLink}
			/>
			<ScheduleSendDialog
				open={compose.scheduling}
				onCancel={() => compose.setScheduling(false)}
				onSchedule={(at) => {
					compose.setScheduling(false);
					const input = fields();
					if (input && hasRecipients)
						onSchedule?.({ ...input, ...files.withoutBlocked() }, at);
				}}
			/>
		</FileDropZone>
	);
}
