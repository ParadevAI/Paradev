import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	buildModelColors,
	ModelBars,
	toTokenRows,
} from "@/app/components/ModelBars";
import { StatStrip } from "@/app/components/StatStrip";
import { TierTube } from "@/app/components/TierTube";
import { TokenSplitBar } from "@/app/components/TokenSplitBar";
import { avatarUrl } from "@/app/utils/avatarUrl";
import { fetchParticipant } from "@/app/utils/fetchLeaderboard";
import {
	dayCount,
	formatCount,
	formatDayRange,
	formatTokens,
	formatUsd,
} from "@/app/utils/formatUsage";
import { ShareButtons } from "./components/ShareButtons";

const pixel = Silkscreen({
	weight: ["400", "700"],
	subsets: ["latin"],
	display: "swap",
});

export const revalidate = 300;

interface PageProps {
	params: Promise<{ handle: string }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { handle } = await params;
	const profile = await fetchParticipant(handle, { period: "all" });

	if (!profile) {
		return { title: "Not found", robots: { index: false } };
	}

	const who = profile.name ?? `@${profile.handle}`;
	const title = `${who} · #${profile.rank} on the ${COMPANY.NAME} leaderboard`;
	const description = `${formatTokens(profile.allTime.tokens)} tokens and ${formatUsd(
		profile.allTime.usd,
	)} of API-equivalent agent usage across ${formatCount(
		profile.models.length,
	)} models.`;
	const url = `/user/${profile.handle}`;

	return {
		title,
		description,
		alternates: { canonical: url },

		openGraph: {
			title,
			description,
			url,
			siteName: COMPANY.NAME,
			type: "profile",
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
		},
	};
}

export default async function UserProfilePage({ params }: PageProps) {
	const { handle } = await params;
	const profile = await fetchParticipant(handle, { period: "all" });

	if (!profile) notFound();

	const colors = buildModelColors([profile.models]);
	const shareUrl = `${COMPANY.MARKETING_URL.replace(/\/$/, "")}/user/${profile.handle}`;
	const shareText = `I'm #${profile.rank} on the ${COMPANY.NAME} leaderboard with ${formatTokens(
		profile.allTime.tokens,
	)} tokens of agent usage.`;

	return (
		<main className="relative min-h-screen">
			<div className="relative max-w-3xl mx-auto px-6 py-10 md:py-14">
				<Link
					href="/leaderboard"
					className="inline-block font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-brand transition-colors"
				>
					← Back to leaderboard
				</Link>

				<header className="text-center pt-8 md:pt-10">
					<Image
						src={avatarUrl(profile.handle)}
						alt=""
						width={72}
						height={72}
						unoptimized
						className="size-18 mx-auto rounded-[3px] bg-foreground/[0.04]"
					/>
					<h1
						className={`${pixel.className} text-2xl md:text-3xl text-foreground mt-5`}
					>
						{profile.name ?? profile.handle}
					</h1>
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground mt-3">
						@{profile.handle} · rank #{profile.rank} of {profile.total}
					</p>

					<div className="mt-7">
						<ShareButtons url={shareUrl} text={shareText} />
					</div>
				</header>

				<div className="mt-10 md:mt-12 space-y-6">
					<TierTube
						subject="you"
						position={
							profile.factory
								? profile.factory.tier + profile.factory.progress
								: 0
						}
						pixelClassName={pixel.className}
					/>

					<StatStrip
						pixelClassName={pixel.className}
						stats={[
							{
								label: "Tokens",
								value: formatTokens(profile.allTime.tokens),
								hint: "all time",
							},
							{
								label: "Cost",
								value: formatUsd(profile.allTime.usd),
								hint: "API-equivalent",
							},
							{
								label: "Rank",
								value: `#${profile.rank}`,
								hint: `of ${profile.total}`,
							},
							{
								label: "Tracking",

								value: profile.dayRange
									? `${dayCount(profile.dayRange)}d`
									: "—",
								hint: profile.dayRange
									? formatDayRange(profile.dayRange)
									: undefined,
							},
						]}
					/>

					<section className="border border-border p-5">
						<h2 className="font-mono text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground mb-4">
							Models
						</h2>
						<ModelBars
							rows={toTokenRows(
								profile.models.map((model) => ({ ...model, usd: model.usd })),
							)}
							colors={colors}
						/>
					</section>

					<section className="border border-border p-5">
						<h2 className="font-mono text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground mb-4">
							Token breakdown
						</h2>
						<TokenSplitBar split={profile.tokenSplit} />
					</section>
				</div>
			</div>
		</main>
	);
}
