import { Trans } from "@lingui/react/macro";
import type { RegistryCard } from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { listingFace } from "renderer/routes/_authenticated/_dashboard/chats/utils/listingFace";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";

interface ListingRowProps {
	card: RegistryCard;
	/** The shelf's lead: drawn larger. */
	isFeatured?: boolean;
	/** The person's own Dev from this listing: Open replaces Get. */
	ownedChatId: string | null;
	onOpen: (card: RegistryCard) => void;
	onGet: (card: RegistryCard) => void;
	onOpenChat: (chatId: string) => void;
}

/** A ready-made Dev in the directory: its face, its name over what it does, and Get. */
export function ListingRow({
	card,
	isFeatured,
	ownedChatId,
	onOpen,
	onGet,
	onOpenChat,
}: ListingRowProps) {
	return (
		<li
			className={cn(
				"flex min-w-0 items-center gap-3",
				isFeatured
					? "rounded-xl bg-fill-selected p-4"
					: "border-border border-b py-3",
			)}
		>
			<button
				type="button"
				onClick={() => onOpen(card)}
				className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
			>
				<FaceAvatar face={listingFace(card.slug)} size={isFeatured ? 56 : 40} />
				<span className="flex min-w-0 flex-col gap-0.5">
					<span
						className={cn(
							"truncate font-medium group-hover:underline",
							isFeatured ? "text-base" : "text-sm",
						)}
					>
						{card.name}
					</span>
					<span className="line-clamp-2 text-muted-foreground text-xs leading-snug">
						{card.summary}
					</span>
				</span>
			</button>
			{ownedChatId ? (
				<Button
					variant="secondary"
					size="sm"
					className="shrink-0"
					onClick={() => onOpenChat(ownedChatId)}
				>
					<Trans>Open</Trans>
				</Button>
			) : (
				<Button
					variant="secondary"
					size="sm"
					className="shrink-0"
					onClick={() => onGet(card)}
				>
					<Trans context="get a ready-made Dev">Get</Trans>
				</Button>
			)}
		</li>
	);
}
