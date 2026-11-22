import { View } from "react-native";
import { cn } from "@/lib/utils";

/** Where an item sits in its group's run, which decides its segment's ends. */
export type GroupBarSegment = "first" | "middle" | "last" | "only";

const END_INSET = 6;

/** A desktop folder colour Home can draw: a hex value, else none. */
export function groupBarColor(color: string | null | undefined): string | null {
	return color?.startsWith("#") ? color : null;
}

/**
 * One item's piece of a group's colour bar on the screen's left edge, as
 * desktop's sidebar draws it. Items stack their pieces into one bar; it
 * takes no space and no touches.
 */
export function GroupBar({
	color,
	segment,
}: {
	color: string;
	segment: GroupBarSegment;
}) {
	const opens = segment === "first" || segment === "only";
	const closes = segment === "last" || segment === "only";
	return (
		<View
			pointerEvents="none"
			className={cn(
				"absolute left-0 w-[3px]",
				opens && "rounded-tr-full",
				closes && "rounded-br-full",
			)}
			style={{
				backgroundColor: color,
				top: opens ? END_INSET : 0,
				bottom: closes ? END_INSET : 0,
			}}
		/>
	);
}
