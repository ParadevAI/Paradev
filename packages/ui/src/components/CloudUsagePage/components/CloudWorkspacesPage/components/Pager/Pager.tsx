"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { LuChevronLeft, LuChevronRight, LuChevronsLeft } from "react-icons/lu";
import { Button } from "../../../../../ui/button";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "../../../../../ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../../../ui/select";
import type { WorkspacesRows } from "../../../../types";
import { ROWS_PER_PAGE } from "../../../../utils/workspacesFilters";

interface PagerProps {
	/** Rows on each loaded page, in order. */
	pageSizes: number[];
	index: number;
	rowCount: number;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onPage: (index: number) => void;
	rows: WorkspacesRows;
	onRows: (rows: WorkspacesRows) => void;
}

/** Pages are cursor pages, so the pager steps one page at a time and cannot jump to the last. */
export function Pager({
	pageSizes,
	index,
	rowCount,
	hasNextPage,
	isFetchingNextPage,
	onPage,
	rows,
	onRows,
}: PagerProps) {
	"use no memo";
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const before = pageSizes.slice(0, index).reduce((sum, size) => sum + size, 0);
	const first = formatNumber(rowCount === 0 ? 0 : before + 1);
	const last = formatNumber(before + (pageSizes[index] ?? 0));
	const page = formatNumber(index + 1);
	const pages = formatNumber(Math.max(1, Math.ceil(rowCount / rows)));
	const canGoOn = index + 1 < pageSizes.length || hasNextPage;

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
			<span className="tabular-nums">
				{rowCount === 0 ? (
					<Trans>0 rows</Trans>
				) : (
					<Plural
						value={rowCount}
						one={`${first}–${last} of # row`}
						other={`${first}–${last} of # rows`}
					/>
				)}
			</span>
			<div className="flex flex-wrap items-center gap-3">
				<span className="flex items-center gap-2">
					<Trans>Rows per page</Trans>
					<Select
						value={String(rows)}
						onValueChange={(value) =>
							onRows(
								ROWS_PER_PAGE.find((option) => String(option) === value) ??
									rows,
							)
						}
					>
						<SelectTrigger
							size="sm"
							aria-label={t({ message: "Rows per page" })}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ROWS_PER_PAGE.map((option) => (
								<SelectItem key={option} value={String(option)}>
									{formatNumber(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</span>
				<span className="tabular-nums">
					<Trans>
						Page {page} of {pages}
					</Trans>
				</span>
				<Pagination className="mx-0 w-auto">
					<PaginationContent>
						<PaginationItem>
							<Button
								variant="outline"
								size="icon-sm"
								disabled={index === 0}
								onClick={() => onPage(0)}
								aria-label={t({ message: "First page" })}
							>
								<LuChevronsLeft />
							</Button>
						</PaginationItem>
						<PaginationItem>
							<Button
								variant="outline"
								size="icon-sm"
								disabled={index === 0}
								onClick={() => onPage(index - 1)}
								aria-label={t({ message: "Previous page" })}
							>
								<LuChevronLeft />
							</Button>
						</PaginationItem>
						<PaginationItem>
							<Button
								variant="outline"
								size="icon-sm"
								disabled={!canGoOn || isFetchingNextPage}
								onClick={() => onPage(index + 1)}
								aria-label={t({ message: "Next page" })}
							>
								<LuChevronRight />
							</Button>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</div>
	);
}
