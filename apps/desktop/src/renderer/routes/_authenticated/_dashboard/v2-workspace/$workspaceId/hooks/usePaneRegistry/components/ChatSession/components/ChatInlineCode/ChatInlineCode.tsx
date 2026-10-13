import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import type { ComponentProps, KeyboardEvent } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import { useIsInsideChatLink } from "../../providers/ChatLinkProvider";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { isLocalPathText, pathFileName } from "../../utils/pathText";

const PlainInlineCode = chatMarkdownComponents.inlineCode;
const FILE_CHIP_CLASSNAME =
	"inline-flex max-w-full items-baseline gap-1 rounded-md bg-foreground/[0.06] px-1.5 py-0.5 align-baseline font-mono text-xs wrap-anywhere";
const OPENABLE_CLASSNAME =
	"cursor-pointer underline-offset-2 hover:text-link-hover hover:underline";

export function ChatInlineCode(props: ComponentProps<typeof PlainInlineCode>) {
	const { openLink } = useChatPaneActions();
	const insideLink = useIsInsideChatLink();
	const text = typeof props.children === "string" ? props.children.trim() : "";
	const fileName = pathFileName(text);
	if (!fileName) return <PlainInlineCode {...props} />;
	if (insideLink) {
		return (
			<PlainInlineCode
				{...props}
				className={cn(
					typeof props.className === "string" && props.className,
					"rounded-none bg-transparent p-0",
				)}
			/>
		);
	}

	const { node: _node, className, children, ...rest } = props;
	const openable = openLink !== undefined && isLocalPathText(text);
	const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		const { left, bottom } = event.currentTarget.getBoundingClientRect();
		openLink?.(text, {
			metaKey: event.metaKey,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			clientX: left,
			clientY: bottom,
		});
	};
	return (
		<code
			{...rest}
			className={cn(
				FILE_CHIP_CLASSNAME,
				openable && OPENABLE_CLASSNAME,
				typeof className === "string" && className,
			)}
			{...(openable
				? {
						role: "link",
						tabIndex: 0,
						onClick: (event) => openLink(text, event),
						onKeyDown,
					}
				: {})}
		>
			<FileIcon className="size-3.5 shrink-0 self-center" fileName={fileName} />
			{children}
		</code>
	);
}
