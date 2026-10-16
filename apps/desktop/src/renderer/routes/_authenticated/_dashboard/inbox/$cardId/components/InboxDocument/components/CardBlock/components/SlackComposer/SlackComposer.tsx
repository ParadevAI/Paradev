import { Trans, useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { EmojiItem } from "@tiptap/extension-emoji";
import { type Editor, useEditorState } from "@tiptap/react";
import {
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	LuAtSign,
	LuBold,
	LuCaseSensitive,
	LuCode,
	LuItalic,
	LuLink,
	LuList,
	LuListOrdered,
	LuSendHorizontal,
	LuSmile,
	LuSquareCode,
	LuStrikethrough,
	LuTextQuote,
	LuUnderline,
} from "react-icons/lu";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import type { RecordMentionItem } from "renderer/components/MarkdownEditor/components/RecordMention/types";
import { useListCursor } from "renderer/hooks/useListCursor";
import { formatHotkeyDisplay } from "renderer/hotkeys/display";
import { PLATFORM } from "renderer/hotkeys/registry";
import { useActionKey } from "../../providers/ActionKeysProvider";
import { useSlackWorkspace } from "../../providers/SlackWorkspaceProvider";
import { ActionKeycap } from "../ActionKeycap";
import { EmojiPicker } from "../EmojiPicker";
import { ChannelMenu } from "./components/ChannelMenu";
import { LinkBar } from "./components/LinkBar";
import { type LinkDraft, LinkEditor } from "./components/LinkEditor";
import {
	createSlackMentionList,
	type SlackMember,
} from "./components/SlackMentionList";
import { SlashCommandMenu } from "./components/SlashCommandMenu";
import { useSlashText } from "./hooks/useSlashText";
import { type ChannelMatch, matchChannels } from "./utils/matchChannels";
import { mrkdwnToMarkdown } from "./utils/mrkdwnConvert";
import {
	docToRichText,
	emojiCharLookup,
	type RichTextBlock,
	richTextToMrkdwn,
} from "./utils/richText";
import type { SlackBlockKind } from "./utils/slackBlocks";
import { SlackChannelMention } from "./utils/slackChannelMention";
import { SlackTyping } from "./utils/slackTyping";
import {
	runSlashCommand,
	type SlashEntry,
	slashEntries,
	typedCommand,
} from "./utils/slashCommands";

const SLACK_EXTENSIONS = [SlackTyping, SlackChannelMention];
const NO_NEW_LINE_BLOCKS: string[] = [];

/** The formatting chords the editor answers, by key code: `shift+KeyX` is ⌘⇧X. */
const FORMATTING_CHORDS = new Set([
	"KeyB",
	"KeyI",
	"KeyU",
	"shift+KeyX",
	"shift+KeyC",
	"shift+Digit7",
	"shift+Digit8",
	"shift+Digit9",
	"alt+shift+KeyC",
]);

function chordOf(event: KeyboardEvent): string | null {
	if (!(event.metaKey || event.ctrlKey)) return null;
	return [event.altKey && "alt", event.shiftKey && "shift", event.code]
		.filter(Boolean)
		.join("+");
}

export type SlackReply = { text: string; blocks?: RichTextBlock[] };

interface SlackComposerProps {
	/** A thread's channel, for "Also send to"; absent where the message is not a thread reply. */
	channelName?: string;
	placeholder?: string;
	draft: string | null;
	members: SlackMember[];
	emoji: Readonly<Record<string, string>>;
	/** Channel id to name, for the `#` picker and drafts that mention channels. */
	channels: Readonly<Record<string, string>>;
	pending: boolean;
	/** Why the last send failed; the text stays for another try. */
	failure: string | null;
	/** Sends from the box; absent where the card's own buttons send what `onChange` reports. */
	onReply?: (reply: SlackReply, alsoSendToChannel: boolean) => void;
	/** Runs a card action a slash command stands for, like `/topic`; absent turns slash commands off. */
	onCommand?: (actionId: string, input: string) => void;
	/** What is written now; null while the box is empty. */
	onChange?: (reply: SlackReply | null) => void;
	/** User-group id to handle. Given where the card confirms who a message notifies: `@channel`, `@here`, `@everyone` and these handles then go out as mentions. */
	notifyGroups?: Readonly<Record<string, string>>;
}

interface ToolProps {
	label: string;
	keys?: string;
	active?: boolean;
	onClick: () => void;
	children: ReactNode;
}

function Tool({ label, keys, active, onClick, children }: ToolProps) {
	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={active}
					onMouseDown={(event) => event.preventDefault()}
					onClick={onClick}
					className={cn(
						"flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground",
						active && "bg-fill-selected text-foreground",
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">
				{label}
				{keys && (
					<span className="ml-2 text-muted-foreground">
						{
							formatHotkeyDisplay(
								keys.replace("mod", PLATFORM === "mac" ? "meta" : "ctrl"),
								PLATFORM,
							).text
						}
					</span>
				)}
			</TooltipContent>
		</Tooltip>
	);
}

const Divider = () => <span className="mx-1 h-4 w-px bg-border" />;

/**
 * Slack's reply box, on our editor: the formatting bar above the text,
 * "Also send to #channel" under it, and a bottom row with the formatting
 * toggle, emoji and mention shortcuts on the left and send on the right.
 * `:name:` completes the workspace's own emoji, `@` the channel's members,
 * Enter sends. The agent's draft is the starting text.
 */
export function SlackComposer({
	channelName,
	placeholder,
	draft,
	members,
	emoji,
	channels,
	pending,
	failure,
	onReply,
	onCommand,
	onChange,
	notifyGroups,
}: SlackComposerProps) {
	const { t } = useLingui();
	const { workspaceUrl } = useSlackWorkspace();
	const sendKey = useActionKey(onReply ? "reply" : undefined);
	const people = useMemo(
		() => new Map(members.map((m) => [m.id, m.name])),
		[members],
	);
	const [markdown, setMarkdown] = useState(() =>
		draft
			? mrkdwnToMarkdown(
					draft,
					people,
					new Set(Object.keys(emoji)),
					channels,
					notifyGroups,
				)
			: "",
	);
	const [alsoSend, setAlsoSend] = useState(false);
	const alsoSendId = useId();
	const [formatting, setFormatting] = useState(true);
	const editorHandle = useRef<Editor | null>(null);
	const [editor, setEditor] = useState<Editor | null>(null);
	useEffect(() => {
		setEditor(editorHandle.current);
	}, []);
	const marks = useEditorState({
		editor,
		selector: ({ editor: e }) => ({
			bold: e?.isActive("bold") ?? false,
			italic: e?.isActive("italic") ?? false,
			underline: e?.isActive("underline") ?? false,
			strike: e?.isActive("strike") ?? false,
			link: e?.isActive("link") ?? false,
			linkHref:
				e?.state.selection.empty && e.isActive("link")
					? ((e.getAttributes("link").href as string | undefined) ?? null)
					: null,
			orderedList: e?.isActive("orderedList") ?? false,
			bulletList: e?.isActive("bulletList") ?? false,
			blockquote: e?.isActive("blockquote") ?? false,
			code: e?.isActive("code") ?? false,
			codeBlock: e?.isActive("codeBlock") ?? false,
		}),
	});
	const channelQuery = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			if (!e) return null;
			const { $from, empty } = e.state.selection;
			if (!empty || $from.parent.type.name === "codeBlock") return null;
			const before = $from.parent.textBetween(
				0,
				$from.parentOffset,
				undefined,
				"\ufffc",
			);
			return /(?:^|[\s\ufffc])#([\w-]{0,80})$/.exec(before)?.[1] ?? null;
		},
	});
	const [dismissedMenu, setDismissedMenu] = useState<string | null>(null);
	const channelMatches =
		channelQuery === null || `#${channelQuery}` === dismissedMenu
			? []
			: matchChannels(channels, channelQuery);
	const channelCursor = useListCursor(channelMatches.length, channelQuery);
	const [lastChannelQuery, setLastChannelQuery] = useState(channelQuery);
	if (channelQuery !== lastChannelQuery) {
		setLastChannelQuery(channelQuery);
		if (channelQuery === null && dismissedMenu?.startsWith("#"))
			setDismissedMenu(null);
	}
	const pickChannel = (channel: ChannelMatch) => {
		if (!editor || channelQuery === null) return;
		const to = editor.state.selection.from;
		editor
			.chain()
			.focus()
			.insertContentAt({ from: to - channelQuery.length - 1, to }, [
				{
					type: "slackChannel",
					attrs: { id: channel.id, label: channel.name },
				},
				{ type: "text", text: " " },
			])
			.run();
	};
	const customEmojis = useMemo<EmojiItem[]>(
		() =>
			Object.entries(emoji).map(([name, url]) => ({
				name,
				shortcodes: [name],
				tags: ["custom"],
				group: "custom",
				fallbackImage: url,
			})),
		[emoji],
	);
	const membersById = useRef(new Map<string, SlackMember>());
	membersById.current = new Map(members.map((m) => [m.id, m]));
	const [mentionList] = useState(() => createSlackMentionList(membersById));
	const searchMentions = useMemo(
		() => async (query: string) => {
			const q = query.toLowerCase();
			return members
				.filter(
					(m) =>
						m.name.toLowerCase().includes(q) ||
						(m.realName?.toLowerCase().includes(q) ?? false),
				)
				.sort((a, b) => Number(b.inChannel) - Number(a.inChannel))
				.slice(0, 12)
				.map(
					(m): RecordMentionItem => ({
						kind: "person",
						id: m.id,
						name: m.name,
						image: m.avatar,
					}),
				);
		},
		[members],
	);

	const emojiChar = useMemo(
		() =>
			emojiCharLookup(
				(editor?.storage.emoji?.emojis as EmojiItem[] | undefined) ?? [],
			),
		[editor],
	);
	const groupIds = useMemo(
		() =>
			notifyGroups &&
			new Map(Object.entries(notifyGroups).map(([id, handle]) => [handle, id])),
		[notifyGroups],
	);
	const composed = editor
		? docToRichText(editor.getJSON(), emojiChar, groupIds)
		: null;
	const text = composed ? richTextToMrkdwn(composed) : "";
	const canSend = text.length > 0 && !pending;
	const written = composed && text ? JSON.stringify(composed) : null;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	useEffect(() => {
		onChangeRef.current?.(
			written ? { text, blocks: [JSON.parse(written) as RichTextBlock] } : null,
		);
	}, [written, text]);
	const [commandError, setCommandError] = useState<string | null>(null);
	const typed = onCommand ? typedCommand(text) : null;
	const slashText = useSlashText();
	const commands =
		typed === null ? [] : slashEntries(typed, slashText.shortcuts);
	const commandCursor = useListCursor(commands.length, typed);
	const commandsOpen = typed !== null && `/${typed}` !== dismissedMenu;
	const [lastTyped, setLastTyped] = useState(typed);
	if (typed !== lastTyped) {
		setLastTyped(typed);
		setCommandError(null);
		if (typed === null && dismissedMenu?.startsWith("/"))
			setDismissedMenu(null);
	}
	const clear = () => {
		editor?.commands.clearContent(true);
		setMarkdown("");
	};
	const fillCommand = (name: string) => {
		editor
			?.chain()
			.clearContent()
			.insertContent(`/${name} `)
			.focus("end")
			.run();
	};
	const pickCommand = (entry: SlashEntry) => {
		if (entry.kind === "command") {
			if (entry.unavailable)
				setCommandError(slashText.unavailable[entry.unavailable]);
			else fillCommand(entry.name);
			return;
		}
		if (entry.shortcut === "away") {
			onCommand?.("set_presence", "away");
			clear();
			return;
		}
		fillCommand(entry.shortcut);
	};
	const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
	const [emojiOpen, setEmojiOpen] = useState(false);
	const openLinkEditor = () => {
		if (!editor?.can().setLink({ href: "https://superset.sh" })) return;
		const existing = editor.isActive("link");
		if (existing) editor.chain().extendMarkRange("link").run();
		const { from, to } = editor.state.selection;
		const selected = editor.state.doc.textBetween(from, to);
		const href =
			(editor.getAttributes("link").href as string | undefined) ?? "";
		const looksLikeUrl = /^(https?:\/\/|www\.)\S+$/.test(selected);
		setLinkDraft({
			text: looksLikeUrl && !existing ? "" : selected,
			url: existing ? href : looksLikeUrl ? selected : "",
			existing,
		});
	};
	const saveLink = (label: string, url: string) => {
		if (!editor) return;
		const { from, to } = editor.state.selection;
		editor
			.chain()
			.focus()
			.insertContentAt(
				{ from, to },
				{
					type: "text",
					text: label,
					marks: [{ type: "link", attrs: { href: url } }],
				},
			)
			.unsetMark("link")
			.run();
		setLinkDraft(null);
	};
	const removeLink = () => {
		editor?.chain().focus().extendMarkRange("link").unsetLink().run();
		setLinkDraft(null);
	};
	const closeLinkEditor = () => {
		setLinkDraft(null);
		editor?.commands.focus();
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			editor?.isActive("listItem") &&
			editor.state.selection.$from.parent.content.size === 0
		) {
			event.preventDefault();
			editor.commands.liftListItem("listItem");
			return true;
		}
		const chord = chordOf(event);
		if (chord === "KeyK" || chord === "shift+KeyU") {
			event.preventDefault();
			event.stopPropagation();
			openLinkEditor();
			return true;
		}
		if (chord === "shift+KeyF") {
			event.preventDefault();
			event.stopPropagation();
			setFormatting((shown) => !shown);
			return true;
		}
		if (chord && FORMATTING_CHORDS.has(chord)) {
			event.stopPropagation();
			return false;
		}
		if (channelMatches.length > 0) {
			if (channelCursor.move(event.key)) return true;
			if (event.key === "Enter" || event.key === "Tab") {
				const picked = channelMatches[channelCursor.highlighted];
				if (picked) pickChannel(picked);
				return true;
			}
			if (event.key === "Escape") {
				event.stopPropagation();
				setDismissedMenu(`#${channelQuery}`);
				return true;
			}
		}
		if (!commandsOpen) return false;
		if (event.key === "Escape") {
			event.stopPropagation();
			setDismissedMenu(`/${typed}`);
			return true;
		}
		if (commands.length === 0) return false;
		if (commandCursor.move(event.key)) return true;
		const picked = commands[commandCursor.highlighted];
		const typedInFull = picked?.kind === "command" && picked.name === typed;
		if (event.key === "Tab" || (event.key === "Enter" && !typedInFull)) {
			if (picked) pickCommand(picked);
			return true;
		}
		return false;
	};
	const send = () => {
		if (!canSend || !onReply) return;
		const command = onCommand ? runSlashCommand(text) : null;
		if (!command) {
			onReply(composed ? { text, blocks: [composed] } : { text }, alsoSend);
			setAlsoSend(false);
			return;
		}
		if (command.kind === "invalid") {
			setCommandError(
				command.reason === "unknown"
					? t({ message: "That isn't a command you can use here" })
					: command.reason === "needs-argument"
						? t({ message: "That command needs more after it" })
						: slashText.unavailable[command.reason],
			);
			return;
		}
		if (command.kind === "post") {
			onReply({ text: command.text }, alsoSend);
			setAlsoSend(false);
			return;
		}
		onCommand?.(command.actionId, command.input);
		clear();
	};
	const run = (command: (chain: ReturnType<Editor["chain"]>) => void) => {
		if (!editor) return;
		command(editor.chain().focus());
	};
	const block = (kind: SlackBlockKind) =>
		editor?.chain().focus().toggleSlackBlock(kind).run();
	const insert = (char: string) => {
		if (!editor) return;
		editor.chain().focus().insertContent(char).run();
	};
	return (
		<div className="relative mx-4 mb-4 rounded-lg border border-input bg-background focus-within:border-foreground/30">
			{linkDraft && (
				<LinkEditor
					initial={linkDraft}
					onSave={saveLink}
					onRemove={removeLink}
					onCancel={closeLinkEditor}
				/>
			)}
			{marks?.linkHref && !linkDraft && (
				<LinkBar
					href={marks.linkHref}
					onEdit={openLinkEditor}
					onRemove={removeLink}
				/>
			)}
			{channelMatches.length > 0 && !linkDraft && (
				<ChannelMenu
					channels={channelMatches}
					selected={channelCursor.highlighted}
					onHover={channelCursor.hover}
					onPick={pickChannel}
				/>
			)}
			{commandsOpen && !linkDraft && channelMatches.length === 0 && (
				<SlashCommandMenu
					entries={commands}
					selected={commandCursor.highlighted}
					onHover={commandCursor.hover}
					onPick={pickCommand}
				/>
			)}
			{formatting && (
				<div className="flex items-center gap-0.5 px-2 pt-1.5">
					<Tool
						label={t({ message: "Bold" })}
						keys="mod+b"
						active={marks?.bold}
						onClick={() => run((c) => c.toggleBold().run())}
					>
						<LuBold className="size-4" />
					</Tool>
					<Tool
						label={t({ message: "Italic" })}
						keys="mod+i"
						active={marks?.italic}
						onClick={() => run((c) => c.toggleItalic().run())}
					>
						<LuItalic className="size-4" />
					</Tool>
					<Tool
						label={t({ message: "Underline" })}
						keys="mod+u"
						active={marks?.underline}
						onClick={() => run((c) => c.toggleUnderline().run())}
					>
						<LuUnderline className="size-4" />
					</Tool>
					<Tool
						label={t({ message: "Strikethrough" })}
						keys="mod+shift+x"
						active={marks?.strike}
						onClick={() => run((c) => c.toggleStrike().run())}
					>
						<LuStrikethrough className="size-4" />
					</Tool>
					<Divider />
					<Tool
						label={t({ message: "Link" })}
						keys="mod+shift+u"
						active={marks?.link}
						onClick={openLinkEditor}
					>
						<LuLink className="size-4" />
					</Tool>
					<Divider />
					<Tool
						label={t({ message: "Numbered list" })}
						keys="mod+shift+7"
						active={marks?.orderedList}
						onClick={() => block("orderedList")}
					>
						<LuListOrdered className="size-4" />
					</Tool>
					<Tool
						label={t({ message: "Bulleted list" })}
						keys="mod+shift+8"
						active={marks?.bulletList}
						onClick={() => block("bulletList")}
					>
						<LuList className="size-4" />
					</Tool>
					<Divider />
					<Tool
						label={t({ message: "Blockquote" })}
						keys="mod+shift+9"
						active={marks?.blockquote}
						onClick={() => block("blockquote")}
					>
						<LuTextQuote className="size-4" />
					</Tool>
					<Divider />
					<Tool
						label={t({ message: "Code" })}
						keys="mod+shift+c"
						active={marks?.code}
						onClick={() => run((c) => c.toggleCode().run())}
					>
						<LuCode className="size-4" />
					</Tool>
					<Tool
						label={t({ message: "Code block" })}
						keys="mod+alt+shift+c"
						active={marks?.codeBlock}
						onClick={() => block("codeBlock")}
					>
						<LuSquareCode className="size-4" />
					</Tool>
				</div>
			)}
			<MarkdownEditor
				content={markdown}
				onChange={setMarkdown}
				onEnterSubmit={onReply ? send : undefined}
				enterNewLineIn={NO_NEW_LINE_BLOCKS}
				onKeyDown={onKeyDown}
				editorHandle={editorHandle}
				placeholder={placeholder ?? t({ message: "Reply…" })}
				features={{
					slashCommand: false,
					fileMention: false,
					bubbleMenu: false,
					trailingNode: false,
					codeBlockLanguages: false,
					markdownPaste: false,
					blurOnEscape: false,
					emojiSpace: true,
				}}
				searchMentions={searchMentions}
				mentionList={mentionList}
				extensions={SLACK_EXTENSIONS}
				customEmojis={customEmojis}
				className="px-3 py-2.5"
				editorClassName="min-h-14 text-[13px] leading-relaxed [&_a]:text-blue-500 [&_a]:no-underline hover:[&_a]:underline dark:[&_a]:text-sky-400 [&_[data-node-view-wrapper]>span]:bg-sky-500/15 [&_[data-node-view-wrapper]>span]:font-normal [&_[data-node-view-wrapper]>span]:text-blue-500 dark:[&_[data-node-view-wrapper]>span]:text-sky-300"
			/>
			{channelName && (
				<label
					htmlFor={alsoSendId}
					className="flex cursor-pointer items-center gap-2 px-3 pb-1 text-xs text-muted-foreground"
				>
					<Checkbox
						id={alsoSendId}
						checked={alsoSend}
						onCheckedChange={(checked) => setAlsoSend(checked === true)}
						className="size-3.5"
					/>
					<span>
						<Trans>
							Also send to{" "}
							<span className="font-medium text-foreground">{channelName}</span>
						</Trans>
					</span>
				</label>
			)}
			<div className="flex items-center gap-0.5 px-2 pb-1.5">
				<Tool
					label={
						formatting
							? t({ message: "Hide formatting" })
							: t({ message: "Show formatting" })
					}
					active={formatting}
					onClick={() => setFormatting((v) => !v)}
				>
					<LuCaseSensitive className="size-4" />
				</Tool>
				<Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
					<PopoverTrigger asChild>
						<span>
							<Tool
								label={t({ message: "Emoji" })}
								onClick={() => setEmojiOpen(true)}
							>
								<LuSmile className="size-4" />
							</Tool>
						</span>
					</PopoverTrigger>
					<PopoverContent side="top" align="start" className="w-auto p-0">
						<EmojiPicker
							emoji={emoji}
							workspaceUrl={workspaceUrl}
							onPick={({ name, toned }) => {
								editor
									?.chain()
									.focus()
									.insertContent(
										toned
											? { type: "text", text: toned }
											: { type: "emoji", attrs: { name } },
									)
									.run();
								setEmojiOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
				<Tool
					label={t({ message: "Mention someone" })}
					onClick={() => insert("@")}
				>
					<LuAtSign className="size-4" />
				</Tool>
				<span className="flex-1" />
				{(commandError ?? failure) && (
					<span
						role="alert"
						className="mr-1 truncate text-[11px] text-destructive"
					>
						{commandError ?? failure}
					</span>
				)}
				{onReply && (
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "Send" })}
								disabled={!canSend}
								data-action-key={sendKey}
								onClick={send}
								className={cn(
									"ml-1 flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 transition-colors",
									canSend
										? "bg-primary text-primary-foreground hover:bg-primary/90"
										: "text-muted-foreground/50",
								)}
							>
								<LuSendHorizontal className="size-4" />
								<ActionKeycap slot={sendKey} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top">
							<Trans>Send</Trans>
						</TooltipContent>
					</Tooltip>
				)}
			</div>
		</div>
	);
}
