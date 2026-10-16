import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkMentions } from "./utils/remarkMentions";

const COMPONENTS: Components = {
	a: ({ node: _node, ...props }) => (
		<a
			{...props}
			target="_blank"
			rel="noreferrer"
			className="text-[#5e6ad2] hover:underline dark:text-[#8b93f0]"
		/>
	),
	p: ({ node: _node, ...props }) => <p {...props} className="my-2" />,
	h1: ({ node: _node, ...props }) => (
		<h1 {...props} className="mt-4 mb-2 text-lg font-semibold" />
	),
	h2: ({ node: _node, ...props }) => (
		<h2 {...props} className="mt-4 mb-2 text-base font-semibold" />
	),
	h3: ({ node: _node, ...props }) => (
		<h3 {...props} className="mt-3 mb-1.5 text-sm font-semibold" />
	),
	ul: ({ node: _node, className, ...props }) => (
		<ul
			{...props}
			className={cn(
				"my-2",
				className?.includes("contains-task-list")
					? "list-none pl-0"
					: "list-disc pl-5",
			)}
		/>
	),
	ol: ({ node: _node, ...props }) => (
		<ol {...props} className="my-2 list-decimal pl-5" />
	),
	li: ({ node: _node, ...props }) => <li {...props} className="my-0.5" />,
	input: ({ node: _node, ...props }) => (
		<input {...props} className="mr-2 size-3.5 align-[-2px]" />
	),
	blockquote: ({ node: _node, ...props }) => (
		<blockquote
			{...props}
			className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
		/>
	),
	pre: ({ node: _node, ...props }) => (
		<pre
			{...props}
			className="my-2 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs [&>code]:bg-transparent [&>code]:p-0"
		/>
	),
	code: ({ node: _node, ...props }) => (
		<code
			{...props}
			className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
		/>
	),
	hr: ({ node: _node, ...props }) => (
		<hr {...props} className="my-3 border-border" />
	),
};

interface LinearMarkdownProps {
	text: string;
	/** The handles a `@mention` in the text can name. */
	handles?: readonly string[];
	className?: string;
}

const NO_HANDLES: readonly string[] = [];

/** A Linear description or comment: its markdown drawn, with mentions marked. */
export function LinearMarkdown({
	text,
	handles = NO_HANDLES,
	className,
}: LinearMarkdownProps) {
	const plugins = useMemo(
		() => [remarkGfm, remarkMentions(handles)],
		[handles],
	);
	return (
		<div
			className={cn(
				"select-text break-words text-[13px] leading-relaxed text-foreground [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_[data-mention]]:rounded-sm [&_[data-mention]]:bg-fill-hover [&_[data-mention]]:px-1 [&_[data-mention]]:font-medium",
				className,
			)}
		>
			<ReactMarkdown remarkPlugins={plugins} components={COMPONENTS}>
				{text}
			</ReactMarkdown>
		</div>
	);
}
