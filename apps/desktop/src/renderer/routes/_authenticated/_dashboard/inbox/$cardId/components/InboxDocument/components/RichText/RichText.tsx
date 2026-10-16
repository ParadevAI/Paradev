import type { RouterOutputs } from "@superset/trpc";
import { cn } from "@superset/ui/utils";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
type ParagraphBlock = Extract<DocumentBlocks[number], { type: "paragraph" }>;
export type RichTextSpans = ParagraphBlock["paragraph"]["rich_text"];

interface RichTextProps {
	spans: RichTextSpans;
	className?: string;
}

export function RichText({ spans, className }: RichTextProps) {
	return (
		<span className={className}>
			{spans.map((span, index) => {
				const a = span.annotations ?? {};
				const text = (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: spans have no identity of their own
						key={index}
						className={cn(
							a.bold && "font-semibold text-foreground",
							a.italic && "italic",
							a.strikethrough && "line-through",
							a.code &&
								"rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground",
						)}
					>
						{span.text.content}
					</span>
				);
				return span.text.link ? (
					<a
						// biome-ignore lint/suspicious/noArrayIndexKey: spans have no identity of their own
						key={index}
						href={span.text.link.url}
						target="_blank"
						rel="noreferrer"
						className="underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
					>
						{text}
					</a>
				) : (
					text
				);
			})}
		</span>
	);
}
