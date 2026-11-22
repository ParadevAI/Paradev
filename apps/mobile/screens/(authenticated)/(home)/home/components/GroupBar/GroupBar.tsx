import { View } from "react-native";
import { cn } from "@/lib/utils";
import type { GroupBarSpan } from "../../types";

const FREE_END_INSET = 6;

/**
 * One item's piece of a group's colour bar on the screen's left edge, as
 * desktop's sidebar draws it. Pieces of neighbouring items join into one
 * plain bar; only an end with nothing coloured beyond it is inset and
 * rounded. It takes no space and no touches.
 */
export function GroupBar({ span }: { span: GroupBarSpan }) {
	return (
		<View
			pointerEvents="none"
			className={cn(
				"absolute left-0 w-[3px]",
				!span.joinTop && "rounded-tr-full",
				!span.joinBottom && "rounded-br-full",
			)}
			style={{
				backgroundColor: span.color,
				top: span.joinTop ? 0 : FREE_END_INSET,
				bottom: span.joinBottom ? 0 : FREE_END_INSET,
			}}
		/>
	);
}
