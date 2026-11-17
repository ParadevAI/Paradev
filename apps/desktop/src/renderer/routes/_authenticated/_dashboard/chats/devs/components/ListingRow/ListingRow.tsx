import { Trans } from "@lingui/react/macro";
import type { RegistryCard } from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import { listingFace } from "renderer/routes/_authenticated/_dashboard/chats/utils/listingFace";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";

interface ListingRowProps {
	card: RegistryCard;
	/** The person's own Dev from this listing: Open replaces Get. */
	ownedChatId: string | null;
	onOpen: (card: RegistryCard) => void;
	onGet: (card: RegistryCard) => void;
	onOpenChat: (chatId: string) => void;
}

/** A ready-made Dev on a shelf: its face, its name in bold over what it does, and Get. */
export function ListingRow({
	card,
	ownedChatId,
	onOpen,
	onGet,
	onOpenChat,
}: ListingRowProps) {
	return (
		<li className="flex min-w-0 items-center gap-3 border-border border-b py-3">
			<button
				type="button"
				onClick={() => onOpen(card)}
				className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
			>
				<FaceAvatar face={listingFace(card.slug)} size={44} />
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-semibold text-[15px] tracking-[-0.01em] group-hover:underline group-hover:underline-offset-2">
						{card.name}
					</span>
					<span className="line-clamp-2 text-[13px] text-muted-foreground leading-snug">
						{card.summary}
					</span>
				</span>
			</button>
			{ownedChatId ? (
				<Button
					variant="secondary"
					size="sm"
					className="shrink-0 px-3 font-semibold"
					onClick={() => onOpenChat(ownedChatId)}
				>
					<Trans>Open</Trans>
				</Button>
			) : (
				<Button
					variant="secondary"
					size="sm"
					className="shrink-0 px-3 font-semibold"
					onClick={() => onGet(card)}
				>
					<Trans context="get a ready-made Dev">Get</Trans>
				</Button>
			)}
		</li>
	);
}
