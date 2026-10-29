"use client";

import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PlanFamily } from "@superset/shared/billing";
import { cn } from "@superset/ui/utils";
import { Check, Minus } from "lucide-react";
import { useState } from "react";
import {
	COMPARISON_SECTIONS,
	type ComparisonRow,
	type PricingTier,
	pricingTiers,
} from "../../constants";
import { comparisonValue, seatPrice } from "../../utils/planDisplay";
import {
	type PlanPriceValues,
	planPriceValues,
} from "../../utils/planPriceValues";

interface ComparisonTableProps {
	catalog: PlanFamily[];
}

interface TableProps {
	tiers: PricingTier[];
	values: PlanPriceValues;
}

export function ComparisonTable({ catalog }: ComparisonTableProps) {
	const { i18n } = useLingui();
	const values = planPriceValues(catalog, i18n);
	const tiers = pricingTiers(catalog);

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-3 text-center">
				<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
					<Trans>Compare plans</Trans>
				</span>
				<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground">
					<Trans>All features, side by side</Trans>
				</h2>
			</div>

			<DesktopTable tiers={tiers} values={values} />
			<MobileTable tiers={tiers} values={values} />
		</div>
	);
}

function DesktopTable({ tiers, values }: TableProps) {
	const { t } = useLingui();

	return (
		<div className="hidden md:block">
			<table className="w-full table-fixed border-separate border-spacing-0">
				<thead>
					<tr>
						<th className="sticky top-16 z-10 w-1/4 border-b border-border bg-background py-4 pr-4 text-left text-sm font-medium text-muted-foreground">
							<Trans>Features</Trans>
						</th>
						{tiers.map((tier) => (
							<th
								key={tier.id}
								className="sticky top-16 z-10 border-b border-border bg-background py-4 px-4 text-left text-sm font-medium text-foreground"
							>
								{typeof tier.name === "string" ? tier.name : t(tier.name)}
								<span className="block font-normal text-xs text-muted-foreground">
									<TierPriceLabel tier={tier} values={values} />
								</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{COMPARISON_SECTIONS.map((section) => (
						<DesktopSectionGroup
							key={section.id}
							title={t(section.title)}
							badge={section.badge}
							columns={tiers.length + 1}
						>
							{section.rows.map((row) => (
								<DesktopRow
									key={row.id}
									row={row}
									tiers={tiers}
									values={values}
								/>
							))}
						</DesktopSectionGroup>
					))}
				</tbody>
			</table>
		</div>
	);
}

function TierPriceLabel({
	tier,
	values,
}: {
	tier: PricingTier;
	values: PlanPriceValues;
}) {
	if (tier.price.kind === "fixed") {
		return <>{tier.price.display}</>;
	}
	if (tier.price.kind === "seat") {
		const set = values.byFamily[tier.id];
		if (!set) return null;
		const price = seatPrice(set, true).display;
		return set.hasYearlyDiscount ? (
			<Trans>from {price}/user/mo</Trans>
		) : (
			<Trans>{price}/user/mo</Trans>
		);
	}
	return <Trans>Custom</Trans>;
}

function DesktopSectionGroup({
	title,
	badge,
	columns,
	children,
}: {
	title: string;
	badge?: MessageDescriptor;
	columns: number;
	children: React.ReactNode;
}) {
	return (
		<>
			<tr>
				<td
					colSpan={columns}
					className="border-b border-border bg-accent/20 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
				>
					<div className="flex items-center gap-2">
						<span>{title}</span>
						{badge && <SectionBadge label={badge} />}
					</div>
				</td>
			</tr>
			{children}
		</>
	);
}

function DesktopRow({
	row,
	tiers,
	values,
}: TableProps & { row: ComparisonRow }) {
	const { t } = useLingui();

	return (
		<tr>
			<td className="border-b border-border/60 py-4 pr-4 text-sm text-foreground">
				{t(row.label)}
			</td>
			{tiers.map((tier) => (
				<td
					key={`${row.id}-${tier.id}`}
					className="border-b border-border/60 px-4 py-4 text-sm text-foreground"
				>
					<Cell value={comparisonValue(row, tier, values)} />
				</td>
			))}
		</tr>
	);
}

function MobileTable({ tiers, values }: TableProps) {
	const { t } = useLingui();
	const [selectedIndex, setSelectedIndex] = useState(1);
	const selectedTier = tiers[selectedIndex];
	if (!selectedTier) return null;

	return (
		<div className="flex flex-col gap-6 md:hidden">
			<div className="flex overflow-x-auto rounded-md border border-border bg-card p-1">
				{tiers.map((tier, index) => (
					<button
						key={tier.id}
						type="button"
						onClick={() => setSelectedIndex(index)}
						aria-pressed={index === selectedIndex}
						className={cn(
							"flex-1 whitespace-nowrap rounded-sm px-2 py-1.5 text-sm font-medium transition-colors",
							index === selectedIndex
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{typeof tier.name === "string" ? tier.name : t(tier.name)}
					</button>
				))}
			</div>

			<div className="flex flex-col gap-6">
				{COMPARISON_SECTIONS.map((section) => (
					<section key={section.id} className="flex flex-col">
						<p className="mb-1 flex items-center gap-2 rounded-md bg-accent/20 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							<span>{t(section.title)}</span>
							{section.badge && <SectionBadge label={section.badge} />}
						</p>
						<ul>
							{section.rows.map((row) => (
								<li
									key={row.id}
									className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0"
								>
									<span className="text-sm text-foreground">
										{t(row.label)}
									</span>
									<div className="shrink-0 text-sm text-foreground">
										<Cell value={comparisonValue(row, selectedTier, values)} />
									</div>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}

function Cell({ value }: { value: ComparisonRow["values"][number] }) {
	const { t } = useLingui();

	if (value === true) {
		return (
			<Check
				className="size-4 text-foreground"
				aria-label={t({
					message: "Included",
				})}
			/>
		);
	}
	if (value === null || value === false) {
		return (
			<Minus
				className="size-4 text-muted-foreground"
				aria-label={t({
					message: "Not included",
				})}
			/>
		);
	}
	return <span>{typeof value === "string" ? value : t(value)}</span>;
}

function SectionBadge({ label }: { label: MessageDescriptor }) {
	const { t } = useLingui();
	return (
		<span className="rounded-sm bg-accent/40 px-2 py-0.5 text-[10px] text-muted-foreground">
			{t(label)}
		</span>
	);
}
