import { Trans } from "@lingui/react/macro";
import type { RegistryCard } from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import { listingFace } from "renderer/routes/_authenticated/_dashboard/chats/utils/listingFace";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";

interface FeaturedListingProps {
	card: RegistryCard;
	/** The person's own Dev from this listing: Open replaces Get. */
	ownedChatId: string | null;
	onOpen: (card: RegistryCard) => void;
	onGet: (card: RegistryCard) => void;
	onOpenChat: (chatId: string) => void;
}

/** The Dev a shelf leads with: its face large beside a big name, what it does, and one button. */
export function FeaturedListing({
	card,
	ownedChatId,
	onOpen,
	onGet,
	onOpenChat,
}: FeaturedListingProps) {
	return (
		<section className="flex items-center gap-7">
			<button
				type="button"
				aria-label={card.name}
				onClick={() => onOpen(card)}
				className="shrink-0 rounded-[28px]"
			>
				<FaceAvatar face={listingFace(card.slug)} size={120} />
			</button>
			<div className="flex min-w-0 flex-col items-start">
				<span className="text-muted-foreground text-xs">
					<Trans>Featured</Trans>
				</span>
				<button
					type="button"
					onClick={() => onOpen(card)}
					className="mt-1 text-left font-semibold text-[32px] leading-[1.05] tracking-[-0.03em] hover:opacity-80"
				>
					{card.name}
				</button>
				<p className="mt-2 max-w-[520px] text-[15px] text-muted-foreground leading-[1.45]">
					{card.summary}
				</p>
				{ownedChatId ? (
					<Button className="mt-4 px-4" onClick={() => onOpenChat(ownedChatId)}>
						<Trans>Open</Trans>
					</Button>
				) : (
					<Button className="mt-4 px-4" onClick={() => onGet(card)}>
						{card.for.includes("you") ? (
							<Trans context="get a ready-made Dev">Get</Trans>
						) : (
							<Trans>Add to a group</Trans>
						)}
					</Button>
				)}
			</div>
		</section>
	);
}
