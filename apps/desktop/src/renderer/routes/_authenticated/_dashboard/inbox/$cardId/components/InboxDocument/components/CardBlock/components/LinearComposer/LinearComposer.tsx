import { cn } from "@superset/ui/utils";
import { TrailingNode } from "@tiptap/extensions";
import { useRef, useState } from "react";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import type { LinearPersonView } from "../../types";
import { LinearEmoji } from "./utils/linearEmoji";
import { LinearMention, linearMentionSuggestion } from "./utils/linearMention";
import { LinearTyping } from "./utils/linearTyping";

const FEATURES = {
	slashCommand: false,
	emoji: false,
	fileMention: false,
	bubbleMenu: false,
	trailingNode: false,
	codeBlockLanguages: false,
	blurOnEscape: false,
};

const KEEPS_CARET = ["bulletList", "orderedList", "taskList", "blockquote"];

const NO_PEOPLE: LinearPersonView[] = [];

interface LinearComposerProps {
	/** The reply box of a thread, or any other comment box. */
	kind?: "reply" | "comment";
	/** Markdown: the text the box starts with. */
	value: string;
	/** The box's text as markdown, with each mention as `@handle`. */
	onChange: (markdown: string) => void;
	placeholder: string;
	/** Who `@` offers. */
	mentionable?: LinearPersonView[];
	/** ⌘Enter. */
	onSubmit?: () => void;
	disabled?: boolean;
	className?: string;
}

/**
 * Linear's comment editor on ours: markdown turns into formatting as it is
 * typed, `@` names a person, `:name` an emoji, Enter starts a paragraph and
 * ⌘Enter submits.
 */
export function LinearComposer({
	kind = "comment",
	value,
	onChange,
	placeholder,
	mentionable = NO_PEOPLE,
	onSubmit,
	disabled,
	className,
}: LinearComposerProps) {
	const people = useRef(mentionable);
	people.current = mentionable;
	const [extensions] = useState(() => [
		LinearTyping,
		LinearMention,
		linearMentionSuggestion(people),
		LinearEmoji,
		TrailingNode.configure({ notAfter: KEEPS_CARET }),
	]);
	return (
		<div data-linear-composer={kind} className={cn("min-w-0", className)}>
			<MarkdownEditor
				content={value}
				onChange={onChange}
				onModEnter={onSubmit}
				placeholder={placeholder}
				editable={!disabled}
				features={FEATURES}
				extensions={extensions}
				editorClassName="text-[13px] leading-relaxed [&_a]:text-[#5e6ad2] [&_a]:no-underline dark:[&_a]:text-[#8b93f0] [&_h1]:!mt-0 [&_h1]:!mb-1 [&_h1]:!text-lg [&_h2]:!mt-0 [&_h2]:!mb-1 [&_h2]:!text-base [&_h3]:!mt-0 [&_h3]:!mb-1 [&_h3]:!text-sm [&_pre]:!my-1.5 [&_pre]:!text-xs"
			/>
		</div>
	);
}
