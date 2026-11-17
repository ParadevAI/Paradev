import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import {
	ownedChatId,
	type RegistryCard,
	type RegistryListing,
	unwrapSoftBreaks,
} from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useState } from "react";
import { LuChevronLeft, LuLoaderCircle } from "react-icons/lu";
import { listingFace } from "renderer/routes/_authenticated/_dashboard/chats/utils/listingFace";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useChats } from "../../../../hooks/useChats";
import { GetDevDialog } from "../../../components/GetDevDialog";
import { useLoaded } from "../../../hooks/useLoaded";

interface ListingScreenProps {
	slug: string;
	/** The group the directory was opened for: Get offers it first. */
	groupId?: string;
}

const cardOf = (listing: RegistryListing): RegistryCard => ({
	...listing,
	needs: {
		apps: listing.needs.apps.map((need) => need.app),
		optional: listing.needs.optional.map((need) => need.app),
	},
});

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-2">
			<h2 className="font-medium text-muted-foreground text-xs">{title}</h2>
			{children}
		</section>
	);
}

/**
 * A ready-made Dev's page: what to say to it, what it needs, and its
 * instructions in full, to read before getting it.
 */
export function ListingScreen({ slug, groupId }: ListingScreenProps) {
	const { t } = useLingui();
	const chats = useChats();
	const navigate = useNavigate();
	const load = chats?.live.registryListing;
	const {
		data: listing,
		hasFailed,
		retry,
	} = useLoaded(
		useCallback(
			() =>
				load
					? load(slug).then((found) => found.listing)
					: new Promise<RegistryListing>(() => {}),
			[load, slug],
		),
	);
	const [isGetting, setGetting] = useState(false);
	const [showsAll, setShowsAll] = useState(false);
	const state = chats?.state ?? null;
	const mine =
		state && listing && !listing.for.includes("group")
			? ownedChatId(state, listing.slug)
			: null;
	const openChat = (chatId: string) =>
		void navigate({ to: "/chats/$chatId", params: { chatId } });
	const needs = listing
		? [
				...listing.needs.apps.map((need) => ({ ...need, isOptional: false })),
				...listing.needs.optional.map((need) => ({
					...need,
					isOptional: true,
				})),
			]
		: [];
	const forLabel = !listing
		? ""
		: listing.for.includes("group") && listing.for.includes("you")
			? t({ message: "For groups or you" })
			: listing.for.includes("group")
				? t({ message: "For groups" })
				: t({ message: "For you" });

	return (
		<div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
			<PageHeader>
				<button
					type="button"
					onClick={() =>
						void navigate({
							to: "/chats/devs",
							search: groupId ? { groupId } : {},
						})
					}
					className="no-drag flex h-8 items-center gap-1 rounded-lg px-1.5 text-muted-foreground text-sm hover:bg-fill-hover hover:text-foreground"
				>
					<LuChevronLeft className="size-4" />
					<Trans>Devs</Trans>
				</button>
				<div className="drag h-full flex-1" />
			</PageHeader>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{!listing ? (
					<output className="flex flex-col items-center gap-3 py-16 text-muted-foreground text-sm">
						{hasFailed ? (
							<>
								<p>
									<Trans>Couldn't load this Dev.</Trans>
								</p>
								<Button variant="secondary" onClick={retry}>
									<Trans>Try again</Trans>
								</Button>
							</>
						) : (
							<LuLoaderCircle className="size-5 animate-spin" />
						)}
					</output>
				) : (
					<div className="mx-auto flex w-full max-w-[920px] flex-col gap-12 px-8 pt-6 pb-16">
						<header className="flex items-center gap-7">
							<FaceAvatar face={listingFace(listing.slug)} size={120} />
							<div className="flex min-w-0 flex-1 flex-col items-start">
								<h1 className="font-semibold text-[40px] leading-none tracking-[-0.035em]">
									{listing.name}
								</h1>
								<p className="mt-3 max-w-[560px] text-[15px] text-muted-foreground leading-[1.45]">
									{listing.summary}
								</p>
								<div className="mt-4 flex items-center gap-3">
									{mine ? (
										<Button className="px-5" onClick={() => openChat(mine)}>
											<Trans>Open</Trans>
										</Button>
									) : (
										<Button className="px-5" onClick={() => setGetting(true)}>
											<Trans context="get a ready-made Dev">Get</Trans>
										</Button>
									)}
									<span className="text-muted-foreground text-xs">
										{forLabel} · v{listing.version}
									</span>
								</div>
							</div>
						</header>

						<div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_280px]">
							<div className="flex min-w-0 flex-col gap-12">
								{listing.examples.length > 0 && (
									<Section title={t({ message: "Try saying" })}>
										<div className="flex flex-wrap gap-2">
											{listing.examples.map((example) => (
												<span
													key={example}
													className="rounded-[18px] bg-fill-selected px-3 py-1.5 text-sm"
												>
													{example}
												</span>
											))}
										</div>
									</Section>
								)}

								{listing.readme.trim() && (
									<Section title={t({ message: "What it does" })}>
										<div className="text-sm">
											<ChatMarkdown>{listing.readme}</ChatMarkdown>
										</div>
									</Section>
								)}

								{listing.instructions.trim() && (
									<Section title={t({ message: "Its instructions" })}>
										<div className="rounded-xl bg-fill-selected px-4 py-3 text-sm">
											<div
												className={cn(
													"min-w-0 [&_pre]:overflow-x-auto",
													!showsAll && "max-h-44 overflow-hidden",
												)}
											>
												<ChatMarkdown>
													{unwrapSoftBreaks(listing.instructions)}
												</ChatMarkdown>
											</div>
											<Button
												variant="ghost"
												size="sm"
												className="mt-2 -ml-2"
												aria-expanded={showsAll}
												onClick={() => setShowsAll((shown) => !shown)}
											>
												{showsAll ? (
													<Trans>Show less</Trans>
												) : (
													<Trans>Show all</Trans>
												)}
											</Button>
										</div>
									</Section>
								)}
							</div>
							<div className="flex min-w-0 flex-col gap-12">
								<Section title={t({ message: "Needs" })}>
									{needs.length === 0 ? (
										<p className="text-sm">
											<Trans>Nothing to connect: it works on its own.</Trans>
										</p>
									) : (
										<ul className="flex flex-col">
											{needs.map((need) => (
												<li
													key={need.app}
													className="flex flex-col gap-0.5 border-border border-b py-2.5 text-sm"
												>
													<span className="font-medium">
														{need.app === "paradev" ? (
															<Trans>Your Paradev access</Trans>
														) : (
															<span className="capitalize">
																{need.app.replace(/[-_]/g, " ")}
															</span>
														)}
														{need.isOptional && (
															<span className="ml-1.5 font-normal text-muted-foreground text-xs">
																<Trans>optional</Trans>
															</span>
														)}
													</span>
													<span className="text-muted-foreground text-xs">
														{need.why}
													</span>
												</li>
											))}
										</ul>
									)}
								</Section>

								<Section title={t({ message: "Version" })}>
									<p className="text-sm tabular-nums">{listing.version}</p>
								</Section>
							</div>
						</div>
					</div>
				)}
			</div>
			{isGetting && listing && state && chats && (
				<GetDevDialog
					state={state}
					card={cardOf(listing)}
					fromGroupId={groupId}
					onOpenChange={(open) => !open && setGetting(false)}
					onGet={(target, name, paradevAccess, plugins) =>
						chats.actions.installListing(listing.slug, target, {
							name,
							paradevAccess,
							plugins,
						})
					}
					onGot={openChat}
				/>
			)}
		</div>
	);
}
