import { Trans, useLingui } from "@lingui/react/macro";
import type {
	ComposerDraft,
	ComposerMentionProvider,
	PromptInputHandle,
} from "@superset/chat-ui/PromptInput";
import { draftText } from "@superset/chat-ui/PromptInput";
import {
	type MentionCandidate,
	mentionToken,
	splitMentions,
} from "@superset/chats-core";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { useEffect, useMemo, useRef } from "react";
import { LuPencil, LuReply, LuX } from "react-icons/lu";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { AgentComposer } from "renderer/routes/_authenticated/components/AgentComposer";

const MENTION_PRIORITY = -1;

const chipFor = (candidate: MentionCandidate) => ({
	label: candidate.label,
	serialized: mentionToken(candidate),
});

/** A sent message as a draft: its words, with each mention as the chip it was picked as. */
function draftOf(text: string, candidates: MentionCandidate[]): ComposerDraft {
	return {
		attachments: [],
		segments: splitMentions(text).map((segment) => {
			if (segment.type === "text") return segment;
			const candidate = candidates.find(
				(entry) => entry.kind === segment.kind && entry.id === segment.id,
			);
			return candidate
				? { type: "chip", chip: chipFor(candidate) }
				: { type: "text", text: mentionToken(segment) };
		}),
	};
}

interface ChatComposerProps {
	placeholder: string;
	/** Who an @ can name in this chat. */
	candidates: MentionCandidate[];
	/** The message the next send answers. */
	replyingTo: { name: string; text: string } | null;
	/** The viewer's own message whose words the composer holds. */
	editing: { text: string } | null;
	onCancel: () => void;
	/** Each file goes as its own message; the text is the first one's caption. */
	onSend: (text: string, files: File[]) => void;
	/** The draft's words after each edit, for telling the chat someone is typing. */
	onTextChange: (text: string) => void;
	/** Up in an empty composer: edit the last message you sent. */
	onEditLast: () => void;
}

/** The app's composer, in a chat: @ names its people and Devs, and a strip says what a send answers or changes. */
export function ChatComposer({
	placeholder,
	candidates,
	replyingTo,
	editing,
	onCancel,
	onSend,
	onTextChange,
	onEditLast,
}: ChatComposerProps) {
	const { t } = useLingui();
	const composer = useRef<PromptInputHandle>(null);
	const candidatesRef = useRef(candidates);
	candidatesRef.current = candidates;

	const editingText = editing?.text;
	useEffect(() => {
		if (editingText !== undefined) {
			composer.current?.restoreDraft(
				draftOf(editingText, candidatesRef.current),
			);
		}
		composer.current?.focus();
	}, [editingText]);

	const title = t({ message: "People and Devs" });
	const mentionProviders = useMemo<ComposerMentionProvider[]>(
		() => [
			{
				id: "chat-members",
				title,
				priority: MENTION_PRIORITY,
				source: {
					kind: "static",
					load: () =>
						candidatesRef.current.map((candidate) => ({
							id: `${candidate.kind}:${candidate.id}`,
							label: candidate.label,
							description: candidate.owner,
							keywords: [candidate.name],
							icon:
								candidate.kind === "dev" ? (
									<FaceAvatar seed={candidate.id} size={16} />
								) : (
									<Avatar size="xs" fullName={candidate.name} image={null} />
								),
							select: (ctx) => ctx.insertChip(chipFor(candidate)),
						})),
				},
			},
		],
		[title],
	);

	const cancel = () => {
		if (editing)
			composer.current?.restoreDraft({ segments: [], attachments: [] });
		onCancel();
	};
	const strip = editing
		? { icon: LuPencil, label: <Trans>Editing message</Trans>, text: "" }
		: replyingTo
			? {
					icon: LuReply,
					label: <Trans>Replying to {replyingTo.name}</Trans>,
					text: replyingTo.text,
				}
			: null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: keys the editor left alone act on the strip
		<div
			onKeyDown={(event) => {
				if (event.defaultPrevented) return;
				if (event.key === "Escape" && strip) {
					event.preventDefault();
					cancel();
				} else if (
					event.key === "ArrowUp" &&
					!strip &&
					composer.current?.isEmpty()
				) {
					event.preventDefault();
					onEditLast();
				}
			}}
		>
			{strip && (
				<div className="mb-1.5 flex items-center gap-2 rounded-lg bg-fill-selected py-1.5 pr-1.5 pl-3.5 text-xs">
					<strip.icon className="size-3.5 shrink-0 text-highlight" />
					<span className="shrink-0 font-medium">{strip.label}</span>
					<span className="min-w-0 flex-1 truncate text-muted-foreground">
						{strip.text}
					</span>
					<button
						type="button"
						aria-label={t({ message: "Cancel" })}
						onClick={cancel}
						className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<LuX className="size-3.5" />
					</button>
				</div>
			)}
			<AgentComposer
				ref={composer}
				layout="inline"
				placeholder={placeholder}
				mentionProviders={mentionProviders}
				autoFocus
				onDraftChange={(draft) => onTextChange(draftText(draft.segments))}
				onSubmit={(payload) => {
					const text = payload.text.trim();
					if (text === "" && payload.files.length === 0) return false;
					onSend(text, payload.files);
				}}
			/>
		</div>
	);
}
