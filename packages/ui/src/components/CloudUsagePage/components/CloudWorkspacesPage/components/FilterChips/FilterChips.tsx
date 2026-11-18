"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { MACHINE_SIZE_NAMES } from "@superset/shared/machine-size-names";
import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { STATUS_PILLS } from "../../../../constants";
import type {
	CloudUsageLink,
	CloudUsageTarget,
	WorkspacesFilters,
} from "../../../../types";

interface FilterChipsProps {
	Link: CloudUsageLink;
	filters: WorkspacesFilters;
	personName: string | undefined;
	/** The Workspaces page with these filters. */
	to: (filters: WorkspacesFilters) => CloudUsageTarget;
}

export function FilterChips({
	Link,
	filters,
	personName,
	to,
}: FilterChipsProps) {
	const { i18n, t } = useLingui();
	const chips: {
		key: keyof WorkspacesFilters;
		label: ReactNode;
		value: string;
	}[] = [
		...(filters.user
			? [
					{
						key: "user" as const,
						label: <Trans>Person</Trans>,
						value: personName ?? "…",
					},
				]
			: []),
		...(filters.size
			? [
					{
						key: "size" as const,
						label: <Trans>Size</Trans>,
						value: i18n._(MACHINE_SIZE_NAMES[filters.size]),
					},
				]
			: []),
		...(filters.status
			? [
					{
						key: "status" as const,
						label: <Trans>Status</Trans>,
						value: i18n._(STATUS_PILLS[filters.status].label),
					},
				]
			: []),
		...(filters.q
			? [{ key: "q" as const, label: <Trans>Search</Trans>, value: filters.q }]
			: []),
	];
	if (chips.length === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-2 text-sm">
			{chips.map((chip) => (
				<span
					key={chip.key}
					className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1"
				>
					<span className="text-muted-foreground">{chip.label}</span>
					{chip.value}
					<Link
						to={to({ ...filters, [chip.key]: undefined })}
						aria-label={t({ message: "Remove this filter" })}
						className="text-muted-foreground hover:text-foreground"
					>
						<LuX className="size-3.5" />
					</Link>
				</span>
			))}
			<Link
				to={to({ sort: filters.sort })}
				className="px-1 text-muted-foreground hover:text-foreground"
			>
				<Trans>Clear all</Trans>
			</Link>
		</div>
	);
}
