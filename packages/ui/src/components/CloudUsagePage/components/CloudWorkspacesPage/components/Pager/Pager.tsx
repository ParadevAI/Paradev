"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { LuChevronLeft, LuChevronRight, LuChevronsLeft } from "react-icons/lu";
import { Button } from "../../../../../ui/button";

interface PagerProps {
	/** Rows on each loaded page, in order. */
	pageSizes: number[];
	index: number;
	rowCount: number;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onPage: (index: number) => void;
}

/** Pages are cursor pages, so the pager steps one page at a time and cannot jump to the last. */
export function Pager({
	pageSizes,
	index,
	rowCount,
	hasNextPage,
	isFetchingNextPage,
	onPage,
}: PagerProps) {
	"use no memo";
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const before = pageSizes.slice(0, index).reduce((sum, size) => sum + size, 0);
	const first = formatNumber(rowCount === 0 ? 0 : before + 1);
	const last = formatNumber(before + (pageSizes[index] ?? 0));
	const pageSize = pageSizes[0] || 1;
	const page = formatNumber(index + 1);
	const pages = formatNumber(Math.max(1, Math.ceil(rowCount / pageSize)));
	const canGoOn = index + 1 < pageSizes.length || hasNextPage;

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
			<span className="tabular-nums">
				<Plural
					value={rowCount}
					one={`${first}–${last} of # row`}
					other={`${first}–${last} of # rows`}
				/>
			</span>
			<div className="flex items-center gap-3">
				<span className="tabular-nums">
					<Trans>
						Page {page} of {pages}
					</Trans>
				</span>
				<div className="flex gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						disabled={index === 0}
						onClick={() => onPage(0)}
						aria-label={t({ message: "First page" })}
					>
						<LuChevronsLeft />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={index === 0}
						onClick={() => onPage(index - 1)}
						aria-label={t({ message: "Previous page" })}
					>
						<LuChevronLeft />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={!canGoOn || isFetchingNextPage}
						onClick={() => onPage(index + 1)}
						aria-label={t({ message: "Next page" })}
					>
						<LuChevronRight />
					</Button>
				</div>
			</div>
		</div>
	);
}
