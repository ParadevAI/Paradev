import { Trans } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import {
	decodeUsageCard,
	encodeUsageCard,
	usageCardAlt,
} from "@superset/shared/usage-card";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { initServerI18n } from "@/app/i18n-server";

interface PageProps {
	searchParams: Promise<{ card?: string }>;
}

export const instant = false;

export async function generateMetadata({
	searchParams,
}: PageProps): Promise<Metadata> {
	await initServerI18n();
	const card = decodeUsageCard((await searchParams).card);
	if (!card) return { robots: { index: false, follow: false } };
	const image = `${COMPANY.MARKETING_URL}/api/usage-card?card=${encodeUsageCard(card)}`;
	return {
		title: `${BRAND.NAME} Wrapped`,
		robots: { index: false, follow: false },
		openGraph: {
			title: `${BRAND.NAME} Wrapped`,
			images: [{ url: image, width: 1200, height: 900 }],
		},
		twitter: {
			card: "summary_large_image",
			title: `${BRAND.NAME} Wrapped`,
			images: [image],
		},
	};
}

export default async function UsageCardPage({ searchParams }: PageProps) {
	await connection();
	await initServerI18n();
	const card = decodeUsageCard((await searchParams).card);
	if (!card) notFound();
	const image = `/api/usage-card?card=${encodeUsageCard(card)}`;
	return (
		<main className="mx-auto max-w-5xl space-y-6 px-6 py-16">
			<h1 className="text-3xl font-semibold">{BRAND.NAME} Wrapped</h1>
			<p className="text-sm text-muted-foreground">
				<Trans>
					A shared snapshot from local agent logs. Stats are self-reported.
					Estimated cost is an API-rate estimate, not a bill.
				</Trans>
			</p>
			<Image
				unoptimized
				src={image}
				width={1200}
				height={900}
				alt={usageCardAlt(card)}
				className="w-full rounded-2xl"
			/>
			<div className="flex flex-wrap gap-3">
				<a
					href={`${image}&download=1`}
					download="paradev-wrapped.png"
					className="rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
				>
					<Trans>Download image</Trans>
				</a>
				<Link href="/download" className="rounded-md border px-4 py-3 text-sm">
					<Trans>Get Paradev</Trans>
				</Link>
				<Link href="/stats" className="rounded-md border px-4 py-3 text-sm">
					<Trans>View usage dashboard</Trans>
				</Link>
			</div>
		</main>
	);
}
