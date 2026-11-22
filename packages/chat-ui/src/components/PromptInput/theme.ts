import type { EditorThemeClasses } from "lexical";

export const COMPOSER_THEME: EditorThemeClasses = {
	paragraph: "m-0",
	quote: "my-0.5 border-l-2 border-border pl-3 text-muted-foreground",
	code: "my-1 block rounded-md bg-muted px-3 py-2 font-mono text-[13px] whitespace-pre-wrap",
	link: "text-primary underline underline-offset-2",
	heading: {
		h1: "my-1 font-semibold text-[1.15em]",
		h2: "my-1 font-semibold text-[1.1em]",
		h3: "my-1 font-semibold",
		h4: "my-1 font-semibold",
		h5: "my-1 font-semibold",
		h6: "my-1 font-semibold",
	},
	list: {
		ul: "my-0.5 list-disc pl-6",
		ol: "my-0.5 list-decimal pl-6",
		listitem: "my-0",
		nested: { listitem: "list-none" },
	},
	text: {
		bold: "font-semibold",
		italic: "italic",
		strikethrough: "line-through",
		code: "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]",
	},
};
