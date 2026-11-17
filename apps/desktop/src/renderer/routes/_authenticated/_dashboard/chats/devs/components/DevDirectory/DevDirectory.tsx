import { Trans, useLingui } from "@lingui/react/macro";
import {
	defaultShelf,
	findListings,
	onShelf,
	ownedChatId,
	type RegistryCard,
	type RegistryShelf,
} from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { LuLoaderCircle, LuSearch } from "react-icons/lu";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useChats } from "../../../hooks/useChats";
import { useLoaded } from "../../hooks/useLoaded";
import { GetDevDialog } from "../GetDevDialog";
import { ListingRow } from "../ListingRow";

/** The Dev each shelf leads with. */
const FEATURED: Record<RegistryShelf, string> = {
	you: "eng-lead",
	groups: "planner",
};

interface DevDirectoryProps {
	/** The group it was opened for: only Devs for groups show, and Get offers that group first. */
	groupId?: string;
}

/**
 * The directory of ready-made Devs: the ones for you and the ones for
 * groups, search across them, and Get on each.
 */
export function DevDirectory({ groupId }: DevDirectoryProps) {
	const { t } = useLingui();
	const chats = useChats();
	const navigate = useNavigate();
	const registry = chats?.live.registry;
	const listings = useLoaded(
		useCallback(
			() =>
				registry
					? registry().then((found) => found.listings)
					: new Promise<RegistryCard[]>(() => {}),
			[registry],
		),
	);
	const [shelf, setShelf] = useState<RegistryShelf>(() =>
		defaultShelf(!!groupId),
	);
	const [query, setQuery] = useState("");
	const [getting, setGetting] = useState<RegistryCard | null>(null);
	const state = chats?.state ?? null;
	const openChat = (chatId: string) =>
		void navigate({ to: "/chats/$chatId", params: { chatId } });
	const openListing = (card: RegistryCard) =>
		void navigate({
			to: "/chats/devs/$slug",
			params: { slug: card.slug },
			search: groupId ? { groupId } : {},
		});
	const cards = listings.data ?? [];
	const isSearching = query.trim() !== "";
	const featured = isSearching
		? undefined
		: cards.find(
				(card) => card.slug === FEATURED[shelf] && onShelf(card, shelf),
			);
	const shown = findListings(cards, shelf, query, {
		shelfOnly: !!groupId,
	}).filter((card) => card !== featured);
	const ownedOf = (card: RegistryCard) =>
		state && (shelf === "you" || !card.for.includes("group"))
			? ownedChatId(state, card.slug)
			: null;
	const shelves: { shelf: RegistryShelf; label: string }[] = [
		{ shelf: "you", label: t({ message: "For you" }) },
		{ shelf: "groups", label: t({ message: "For groups" }) },
	];

	return (
		<div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
			<PageHeader>
				<div className="drag h-full flex-1" />
			</PageHeader>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 px-8 pt-4 pb-16">
					<div className="flex items-end gap-4">
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<h1 className="font-semibold text-[28px] leading-tight tracking-[-0.02em]">
								<Trans>Devs</Trans>
							</h1>
							<p className="text-muted-foreground text-sm">
								<Trans>
									Ready-made Devs. Get one for yourself, or add one to a group.
								</Trans>
							</p>
						</div>
						<div className="relative w-56 shrink-0">
							<LuSearch className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								aria-label={t({ message: "Search Devs" })}
								placeholder={t({ message: "Search Devs" })}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								className="pl-8 text-sm"
							/>
						</div>
					</div>
					{!groupId && (
						<div role="tablist" className="flex gap-1">
							{shelves.map((entry) => (
								<button
									key={entry.shelf}
									type="button"
									role="tab"
									aria-selected={entry.shelf === shelf && !isSearching}
									disabled={isSearching}
									onClick={() => setShelf(entry.shelf)}
									className={cn(
										"rounded-lg px-3 py-1.5 font-medium text-sm disabled:opacity-50",
										entry.shelf === shelf && !isSearching
											? "bg-fill-selected"
											: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
									)}
								>
									{entry.label}
								</button>
							))}
						</div>
					)}
					{listings.data === null ? (
						<output className="flex flex-col items-center gap-3 py-16 text-muted-foreground text-sm">
							{listings.hasFailed ? (
								<>
									<p>
										<Trans>Couldn't load the Devs.</Trans>
									</p>
									<Button variant="secondary" onClick={listings.retry}>
										<Trans>Try again</Trans>
									</Button>
								</>
							) : (
								<LuLoaderCircle className="size-5 animate-spin" />
							)}
						</output>
					) : (
						<ul className="flex flex-col">
							{featured && (
								<ListingRow
									card={featured}
									isFeatured
									ownedChatId={ownedOf(featured)}
									onOpen={openListing}
									onGet={setGetting}
									onOpenChat={openChat}
								/>
							)}
							{shown.map((card) => (
								<ListingRow
									key={card.slug}
									card={card}
									ownedChatId={ownedOf(card)}
									onOpen={openListing}
									onGet={setGetting}
									onOpenChat={openChat}
								/>
							))}
							{shown.length === 0 && !featured && (
								<p className="py-10 text-center text-muted-foreground text-sm">
									{isSearching ? (
										<Trans>No Dev matches “{query.trim()}”.</Trans>
									) : (
										<Trans>No Devs here yet.</Trans>
									)}
								</p>
							)}
						</ul>
					)}
				</div>
			</div>
			{getting && state && chats && (
				<GetDevDialog
					state={state}
					card={getting}
					fromGroupId={groupId}
					onOpenChange={(open) => !open && setGetting(null)}
					onGet={(target, name, paradevAccess) =>
						chats.actions.installListing(getting.slug, target, {
							name,
							paradevAccess,
						})
					}
					onGot={openChat}
				/>
			)}
		</div>
	);
}
