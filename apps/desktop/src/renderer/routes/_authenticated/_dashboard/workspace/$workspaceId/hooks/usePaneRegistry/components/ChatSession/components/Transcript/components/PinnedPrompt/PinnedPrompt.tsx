import { cn } from "@superset/ui/utils";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_GUTTER_CLASSNAME,
} from "../../../../constants";
import { useScrolledPast } from "./hooks/useScrolledPast";

/** It repeats a message already in the transcript, so it is hidden from readers and the pointer. */
export function PinnedPrompt({
	messageId,
	text,
	viewport,
}: {
	messageId: string | null;
	text: string;
	viewport: HTMLElement | null;
}) {
	const scrolledPast = useScrolledPast(viewport, messageId);
	if (!scrolledPast) return null;
	return (
		<div
			aria-hidden="true"
			className={cn(
				CHAT_GUTTER_CLASSNAME,
				"pointer-events-none absolute inset-x-0 top-0 z-10 border-border/60 border-b bg-background/85 backdrop-blur-sm",
			)}
		>
			<div className={cn(CHAT_COLUMN_CLASSNAME, "flex justify-end px-4 py-2")}>
				<span className="max-w-[min(100%,36rem)] truncate rounded-full bg-foreground/10 px-3 py-1.5 font-sans text-sm">
					{text}
				</span>
			</div>
		</div>
	);
}
