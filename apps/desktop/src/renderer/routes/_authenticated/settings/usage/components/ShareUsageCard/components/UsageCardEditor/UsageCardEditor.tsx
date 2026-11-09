import { Trans, useLingui } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import {
	type CardStatId,
	encodeUsageCard,
	usageCardAlt,
	usageCardDataUrl,
} from "@superset/shared/usage-card";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { buildUsageCard, DEFAULT_CARD_STATS } from "./buildUsageCard";
import { usageCardPng } from "./usageCardPng";

export function UsageCardEditor({ hostUrl }: { hostUrl: string }) {
	const { t } = useLingui();
	const [days, setDays] = useState<30 | 365>(30);
	const [selected, setSelected] = useState<Set<CardStatId>>(
		() => new Set(DEFAULT_CARD_STATS),
	);
	const [showBreakdown, setShowBreakdown] = useState(true);
	const [busy, setBusy] = useState(false);
	const summary = useQuery({
		queryKey: ["usage-wrapped", hostUrl, days],
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).usage.wrapped.query({ days }),
		staleTime: 5 * 60_000,
		retry: false,
	});
	const membership = useQuery({
		queryKey: ["leaderboard", "me", "all"],
		queryFn: () => apiTrpcClient.leaderboard.me.query({ period: "all" }),
		retry: false,
	});
	const handle = membership.data?.handle;
	const standing = useQuery({
		queryKey: ["usage-card-tier", handle],
		enabled: Boolean(handle),
		queryFn: () =>
			apiTrpcClient.leaderboard.public.standing.query({
				handle: handle ?? "",
				period: "30d",
				metric: "tokens",
			}),
		retry: false,
	});
	const labels: Record<CardStatId, string> = {
		prs: t({ message: "Merged PRs" }),
		tokens: t({ message: "Tokens" }),
		agents: t({ message: "Agents used" }),
		model: t({ message: "Top model" }),
		streak: t({ message: "Longest streak (days)" }),
		tier: t({ message: "Current leaderboard tier" }),
		cost: t({ message: "Estimated cost" }),
	};
	const card = buildUsageCard({
		data: summary.data,
		tier: standing.data?.tier,
		selected,
		showBreakdown,
		labels,
		breakdownLabel: t({ message: "Top agents by tokens" }),
	});
	const shareUrl = card
		? `${COMPANY.MARKETING_URL}/share/usage?card=${encodeUsageCard(card)}`
		: null;
	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} catch {
			toast.error(
				t({ message: "Couldn't share usage card. Try downloading the image." }),
			);
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-4">
				<select
					aria-label={t({ message: "Date range" })}
					className="rounded-md border bg-background px-3 py-2 text-sm"
					value={days}
					onChange={(event) => setDays(Number(event.target.value) as 30 | 365)}
				>
					<option value={30}>
						<Trans>Last 30 days</Trans>
					</option>
					<option value={365}>
						<Trans>Last 365 days</Trans>
					</option>
				</select>
				{Object.entries(labels).map(([id, label]) => (
					<label key={id} className="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							className="size-3.5 accent-primary"
							checked={selected.has(id as CardStatId)}
							onChange={() =>
								setSelected((previous) => {
									const next = new Set(previous);
									if (next.has(id as CardStatId)) next.delete(id as CardStatId);
									else next.add(id as CardStatId);
									return next;
								})
							}
						/>
						{label}
					</label>
				))}
				<label className="flex items-center gap-2 text-xs">
					<input
						type="checkbox"
						className="size-3.5 accent-primary"
						checked={showBreakdown}
						onChange={(event) => setShowBreakdown(event.target.checked)}
					/>
					<Trans>Agent breakdown</Trans>
				</label>
			</div>
			{summary.isPending ? (
				<output className="py-12 text-center text-sm text-muted-foreground">
					<Trans>Scanning transcript logs…</Trans>
				</output>
			) : summary.isError ? (
				<div role="alert" className="space-y-2 text-sm">
					<p>
						<Trans>
							Usage cards are unavailable on this host. Update the host and try
							again.
						</Trans>
					</p>
					<Button variant="outline" onClick={() => void summary.refetch()}>
						<Trans>Retry</Trans>
					</Button>
				</div>
			) : card ? (
				<img
					src={usageCardDataUrl(card)}
					alt={usageCardAlt(card)}
					className="max-h-[45vh] w-full rounded-xl object-contain"
				/>
			) : (
				<p className="py-12 text-center text-sm">
					<Trans>Select at least one available stat.</Trans>
				</p>
			)}
			<p className="text-xs text-muted-foreground">
				<Trans>
					From this host's local logs. Estimated cost uses API list rates, not
					your bill. PRs are linked to workspace agents and may count for more
					than one agent.
				</Trans>
			</p>
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={!card || busy}
					onClick={() =>
						card &&
						void run(async () => {
							await navigator.clipboard.write([
								new ClipboardItem({ "image/png": usageCardPng(card) }),
							]);
							toast.success(t({ message: "Image copied" }));
						})
					}
				>
					<Trans>Copy image</Trans>
				</Button>
				<Button
					variant="outline"
					disabled={!card || busy}
					onClick={() =>
						card &&
						void run(async () => {
							const url = URL.createObjectURL(await usageCardPng(card));
							const anchor = document.createElement("a");
							anchor.href = url;
							anchor.download = "paradev-wrapped.png";
							anchor.click();
							setTimeout(() => URL.revokeObjectURL(url), 1000);
						})
					}
				>
					<Trans>Download image</Trans>
				</Button>
				<Button
					variant="outline"
					disabled={!shareUrl || busy}
					onClick={() =>
						shareUrl &&
						void run(async () => {
							await navigator.clipboard.writeText(shareUrl);
							toast.success(t({ message: "Link copied" }));
						})
					}
				>
					<Trans>Copy link</Trans>
				</Button>
				<Button
					variant="outline"
					disabled={!shareUrl || busy}
					onClick={() => {
						if (shareUrl)
							window.open(
								`https://x.com/intent/tweet?${new URLSearchParams({ text: `${BRAND.NAME} Wrapped`, url: shareUrl })}`,
								"_blank",
								"noopener,noreferrer",
							);
					}}
				>
					<Trans>Share to X</Trans>
				</Button>
			</div>
		</div>
	);
}
