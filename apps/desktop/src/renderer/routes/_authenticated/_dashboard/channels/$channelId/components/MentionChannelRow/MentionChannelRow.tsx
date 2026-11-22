import { LuHash, LuLock } from "react-icons/lu";

interface MentionChannelRowProps {
	name: string;
	visibility: "public" | "private";
}

/** A channel in the # menu: its sidebar icon, then its name. */
export function MentionChannelRow({
	name,
	visibility,
}: MentionChannelRowProps) {
	const Icon = visibility === "private" ? LuLock : LuHash;
	return (
		<>
			<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
				<Icon className="size-4" />
			</span>
			<span className="truncate font-medium">{name}</span>
		</>
	);
}
