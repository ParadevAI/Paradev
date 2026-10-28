import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { Check } from "lucide-react";
import { DownloadLink } from "@/app/[lang]/components/DownloadLink";
import { TrackedLink } from "@/app/[lang]/components/TrackedLink";
import { env } from "@/env";
import { BETA, type PricingTier } from "../../../../constants";
import { checkoutHref } from "../../../../utils/checkoutHref";
import { seatPrice } from "../../../../utils/planDisplay";
import {
	type FamilyPriceSet,
	featureShown,
	featureValues,
	type PlanPriceValues,
} from "../../../../utils/planPriceValues";
import { FeatureInfo } from "./components/FeatureInfo";

interface PricingCardProps {
	tier: PricingTier;
	isYearly: boolean;
	values: PlanPriceValues;
	wide?: boolean;
}

export function PricingCard({
	tier,
	isYearly,
	values,
	wide,
}: PricingCardProps) {
	const { t, i18n } = useLingui();
	const set = values.byFamily[tier.id];
	const { display, strikethrough, note, cadence } = resolvePrice(
		tier,
		isYearly,
		set,
	);

	const name = typeof tier.name === "string" ? tier.name : t(tier.name);
	const ctaLabel = i18n._({ ...tier.cta.label, values: { plan: name } });

	return (
		<div
			className={cn(
				"row-span-4 grid grid-rows-subgrid gap-6 rounded-lg border p-6 md:p-8 xl:p-6",
				wide && "md:col-span-2 lg:col-span-4 xl:col-span-1",
				tier.highlight
					? "border-foreground/30 bg-accent/20"
					: "border-border bg-card/40",
			)}
		>
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-medium text-foreground">{name}</h3>
					{tier.highlight && (
						<span className="rounded-sm bg-foreground px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
							<Trans>Popular</Trans>
						</span>
					)}
				</div>
				<p className="text-sm text-muted-foreground">{t(tier.description)}</p>
			</div>

			<div className="flex flex-col gap-1">
				<div className="flex min-h-10 flex-wrap items-baseline gap-x-2 gap-y-1">
					{strikethrough && (
						<span className="text-2xl font-medium tracking-tight leading-none text-muted-foreground line-through">
							{strikethrough}
						</span>
					)}
					<span
						className={cn(
							"font-medium tracking-tight leading-none text-foreground",
							tier.price.kind === "custom"
								? "text-3xl break-words xl:text-2xl"
								: "text-4xl",
						)}
					>
						{typeof display === "string" ? display : t(display)}
					</span>
					{note && (
						<span className="basis-full text-sm leading-none text-muted-foreground">
							{t(note)}
						</span>
					)}
				</div>
				{cadence && (
					<p className="text-xs text-muted-foreground">{i18n._(cadence)}</p>
				)}
			</div>

			<div
				className={cn(
					"flex flex-col gap-2",
					wide && "md:max-w-xs xl:max-w-none",
				)}
			>
				<Button asChild variant={tier.cta.variant} size="lg" className="w-full">
					{tier.cta.external ? (
						<a href={tier.cta.href} target="_blank" rel="noopener noreferrer">
							{ctaLabel}
						</a>
					) : tier.cta.event === "download_clicked" ? (
						<DownloadLink source="pricing" properties={{ tier: tier.id }}>
							{ctaLabel}
						</DownloadLink>
					) : (
						<TrackedLink
							href={
								tier.price.kind === "seat"
									? checkoutHref(
											env.NEXT_PUBLIC_WEB_URL,
											tier.id,
											isYearly && Boolean(set?.hasYearlyDiscount),
										)
									: tier.cta.href
							}
							event={tier.cta.event}
							properties={{
								source: "pricing",
								tier: tier.id,
								yearly: isYearly,
							}}
						>
							{ctaLabel}
						</TrackedLink>
					)}
				</Button>
				<CtaNote note={tier.ctaNote} />
			</div>

			<ul
				className={cn(
					"flex flex-col gap-3 border-t border-border pt-6",
					wide && "md:grid md:grid-cols-2 lg:grid-cols-3 xl:flex",
				)}
			>
				{tier.features
					.filter((feature) => featureShown(feature, set))
					.map((feature) => (
						<li
							key={feature.id}
							className="flex items-start gap-2.5 text-sm text-foreground"
						>
							<Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<div className="flex flex-col gap-1">
								<span>
									{i18n._({ ...feature.label, values: featureValues(set) })}
									{feature.beta && (
										<span className="ml-2 rounded-sm bg-accent/40 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
											{t(BETA)}
										</span>
									)}
								</span>
								{feature.detail && (
									<p className="text-xs text-muted-foreground">
										{feature.info ? (
											<FeatureInfo
												body={feature.info.body}
												faqId={feature.info.faqId}
												values={featureValues(set)}
											>
												{i18n._({
													...feature.detail,
													values: featureValues(set),
												})}
											</FeatureInfo>
										) : (
											i18n._({ ...feature.detail, values: featureValues(set) })
										)}
									</p>
								)}
							</div>
						</li>
					))}
			</ul>
		</div>
	);
}

function CtaNote({ note }: { note: PricingTier["ctaNote"] }) {
	const { t } = useLingui();
	if (!note) {
		return <p className="h-4" aria-hidden="true" />;
	}
	if (note.href) {
		return (
			<a
				href={note.href}
				target="_blank"
				rel="noopener noreferrer"
				className="text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
			>
				{t(note.label)}
			</a>
		);
	}
	return (
		<p className="text-center text-xs text-muted-foreground">{t(note.label)}</p>
	);
}

function resolvePrice(
	tier: PricingTier,
	isYearly: boolean,
	set: FamilyPriceSet | undefined,
): {
	display: string | MessageDescriptor;
	strikethrough: string | null;
	note: MessageDescriptor | null;
	cadence: MessageDescriptor | null;
} {
	if (tier.price.kind === "fixed" || tier.price.kind === "custom") {
		return {
			display: tier.price.display,
			strikethrough: null,
			note: null,
			cadence: tier.price.note,
		};
	}
	if (!set) {
		return { display: "", strikethrough: null, note: null, cadence: null };
	}
	const yearly = isYearly && set.hasYearlyDiscount;
	return {
		...seatPrice(set, yearly),
		note: tier.price.note,
		cadence: {
			...(yearly ? tier.price.yearlyCadence : tier.price.monthlyCadence),
			values: { yearlyTotal: set.yearlyTotal },
		},
	};
}
