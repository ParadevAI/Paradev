"use client";

import { Plural, Trans } from "@lingui/react/macro";
import type { HeldLine } from "@superset/shared/cloud-usage-display";
import type { ReactNode } from "react";
import { cn } from "../../../../../../lib/utils";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemTitle,
} from "../../../../../ui/item";
import { SEGMENT_COLORS } from "../../constants";

interface AllowanceLinesProps {
	lines: HeldLine[];
	seats: number | null;
	format: (usd: number) => string;
}

export function AllowanceLines({ lines, seats, format }: AllowanceLinesProps) {
	const label = (line: HeldLine): ReactNode => {
		switch (line.kind) {
			case "included":
				return seats === null ? (
					<Trans>Included with the plan</Trans>
				) : (
					<Plural
						value={seats}
						one="Included with # seat"
						other="Included with # seats"
					/>
				);
			case "freeCredits":
				return <Trans>Free credits</Trans>;
			case "bought":
				return <Trans>Bought credits</Trans>;
		}
	};
	const heading = (text: ReactNode) => (
		<p className="pt-2 text-xs tracking-wide text-muted-foreground uppercase">
			{text}
		</p>
	);
	const row = (line: HeldLine) => {
		const used = format(line.used.usd);
		const total = format(line.total.usd);
		return (
			<Item key={line.kind} role="listitem" size="sm" className="px-0">
				<ItemContent>
					<ItemTitle className="font-normal">
						<span
							aria-hidden
							className={cn("size-2 rounded-[2px]", SEGMENT_COLORS[line.kind])}
						/>
						{label(line)}
					</ItemTitle>
				</ItemContent>
				<ItemActions className="tabular-nums">
					<Trans>
						{used} of {total}
					</Trans>
				</ItemActions>
			</Item>
		);
	};
	const free = lines.filter((line) => line.kind !== "bought");
	const paid = lines.filter((line) => line.kind === "bought");
	const grouped = paid.length > 0;

	return (
		<ItemGroup>
			{grouped && heading(<Trans context="cloud allowance group">Free</Trans>)}
			{free.map(row)}
			{grouped && heading(<Trans context="cloud allowance group">Paid</Trans>)}
			{paid.map(row)}
		</ItemGroup>
	);
}
