import { billingUsesAutumn } from "@superset/auth/autumn";
import { type CloudUsage, organizationBilling } from "@superset/auth/billing";
import { db } from "@superset/db/client";
import {
	type CloudBillingAnchor,
	type CloudUsageScope,
	cloudBillingPeriod,
	cloudBillingPeriodIndex,
	gbMinutesUsd,
	listCloudBoots,
	queryCloudUsage,
	queryCloudUsageByPeriod,
} from "@superset/db/cloud-usage-query";
import { organizations } from "@superset/db/schema";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userError } from "../../i18n-error";
import { posthog } from "../../lib/analytics";
import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { organizationFlagEnabled } from "../../lib/feature-flags";
import { personProcedure } from "../../trpc";
import { requireActiveOrgRole } from "../utils/active-org";
import {
	bootKeysetSchema,
	type CloudListFilters,
	type CloudPeriodUnavailable,
	type CloudRange,
	cloudBootsInputSchema,
	cloudBootsOutputSchema,
	cloudPeriodsInputSchema,
	cloudPeriodsOutputSchema,
	cloudUsageInputSchema,
	cloudUsageOutputSchema,
	type RangePreset,
	type UsageKeyset,
	usageKeysetSchemas,
} from "./schema";

export interface CloudDeps {
	db: Parameters<typeof queryCloudUsage>[0] &
		NonNullable<Parameters<typeof requireActiveOrgRole>[1]>;
	cloudUsage: (organizationId: string) => Promise<CloudUsage | null>;
	flags: Parameters<typeof organizationFlagEnabled>[0];
}

const HOUR_MS = 60 * 60 * 1000;
const PRESET_MS: Record<RangePreset, number> = {
	"24h": 24 * HOUR_MS,
	"7d": 7 * 24 * HOUR_MS,
	"30d": 30 * 24 * HOUR_MS,
	"90d": 90 * 24 * HOUR_MS,
};

function anchorOf(cloudUsage: CloudUsage | null): CloudBillingAnchor | null {
	return cloudUsage?.resetsAt
		? { resetsAt: new Date(cloudUsage.resetsAt), previousResetAt: null }
		: null;
}

function creditLine(credit: CloudUsage["bought"], rate: number | null) {
	if (!credit?.grantedGbMinutes) return null;
	const used = credit.grantedGbMinutes - credit.remainingGbMinutes;
	return {
		usedGbHours: used / 60,
		totalGbHours: credit.grantedGbMinutes / 60,
		usedUsd: gbMinutesUsd(used, rate),
		totalUsd: gbMinutesUsd(credit.grantedGbMinutes, rate),
	};
}

function allowanceOf(cloudUsage: CloudUsage, resetsAt: Date) {
	const rate = cloudUsage.overagePerGbHour;
	const included = cloudUsage.includedGbMinutes;
	const limit = cloudUsage.overageLimit;
	const unavailable: CloudPeriodUnavailable[] =
		cloudUsage.bought === null
			? (
					[
						"seats",
						"bought",
						"freeCredits",
						"extraUsageLimit",
						"limitReached",
					] as const
				).map((field) => ({ field, reason: "not_read" }))
			: [];
	if (limit?.type === "usage_percentage") {
		unavailable.push({
			field: "extraUsageLimit",
			reason: "percent_of_allowance",
		});
	}
	if (cloudUsage.bought !== null && cloudUsage.limitReached === null) {
		unavailable.push({ field: "limitReached", reason: "not_tracked" });
	}
	return {
		allowance: {
			includedGbHours: included === null ? null : included / 60,
			usedGbHours: cloudUsage.usedGbMinutes / 60,
			overageGbHours: cloudUsage.overageGbMinutes / 60,
			prepaidRemainingGbHours: cloudUsage.prepaidGbMinutes / 60,
			resetsAt,
			usedUsd: gbMinutesUsd(cloudUsage.usedGbMinutes, rate),
			includedUsd: included === null ? null : gbMinutesUsd(included, rate),
			overageUsd: gbMinutesUsd(cloudUsage.overageGbMinutes, rate),
			seats: cloudUsage.seats,
			bought: creditLine(cloudUsage.bought, rate),
			freeCredits: creditLine(cloudUsage.freeCredits, rate),
			extraUsageLimit:
				limit?.type === "absolute"
					? {
							gbHours: limit.gbMinutes / 60,
							usd: gbMinutesUsd(limit.gbMinutes, rate),
						}
					: null,
			limitReached: cloudUsage.limitReached,
		},
		unavailable,
	};
}

function noAllowance(reason: "closed_period" | "owners_and_admins_only") {
	return {
		allowance: null,
		unavailable: [{ field: "allowance", reason } as const],
	};
}

function periodId(start: Date): string {
	return start.toISOString().slice(0, 10);
}

function cursorNotValid() {
	return userError({
		code: "BAD_REQUEST",
		message:
			"That cursor could not be read. Drop it to start from the first page.",
		i18nKey: "serverError.cloud.cursorNotValid",
	});
}

const CURSOR_FILTER_KEYS = Object.keys({
	endReason: true,
	groupBy: true,
	open: true,
	order: true,
	range: true,
	search: true,
	size: true,
	sort: true,
	status: true,
	user: true,
	workspace: true,
} satisfies Record<keyof CloudListFilters, true>) as (keyof CloudListFilters)[];

function filtersOf(filters: Partial<Record<keyof CloudListFilters, unknown>>) {
	return Object.fromEntries(
		CURSOR_FILTER_KEYS.map((key) => [key, filters[key]]),
	);
}

function readCursor<T>(
	input: Partial<CloudListFilters> & { cursor?: string },
	keyset: z.ZodType<T>,
): T | undefined {
	if (input.cursor === undefined) return undefined;
	const cursor = decodeCursor(
		input.cursor,
		z.object({ filters: z.record(z.string(), z.unknown()), keyset }),
	);
	if (
		!cursor ||
		JSON.stringify(filtersOf(cursor.filters)) !==
			JSON.stringify(filtersOf(input))
	) {
		throw cursorNotValid();
	}
	return cursor.keyset;
}

function writeCursor(input: Partial<CloudListFilters>, keyset: object): string {
	return encodeCursor({ filters: filtersOf(input), keyset });
}

function windowFor(range: CloudRange, anchor: CloudBillingAnchor | null) {
	if (typeof range === "string") {
		const to = new Date();
		return { from: new Date(to.getTime() - PRESET_MS[range]), to };
	}
	if (!("period" in range)) return range;
	if (!anchor) {
		throw userError({
			code: "BAD_REQUEST",
			message:
				"This organization has no billing periods. Choose a time range instead.",
			i18nKey: "serverError.cloud.noBillingPeriods",
		});
	}
	const index =
		range.period === "current"
			? 0
			: cloudBillingPeriodIndex(anchor, range.period);
	if (index === null) {
		throw userError({
			code: "NOT_FOUND",
			message: `No billing period starts on ${range.period}.`,
			i18nKey: "serverError.cloud.noBillingPeriodStartsOn",
			params: { period: range.period },
		});
	}
	return cloudBillingPeriod(anchor, index);
}

export function cloudRouterWith(deps: CloudDeps) {
	const scopedProcedure = personProcedure.use(async ({ ctx, next }) => {
		const { organizationId, isAdmin } = await requireActiveOrgRole(
			ctx,
			deps.db,
		);
		const enabled = await organizationFlagEnabled(
			deps.flags,
			FEATURE_FLAGS.CLOUD_USAGE,
			organizationId,
		);
		if (!enabled) {
			throw userError({
				code: "FORBIDDEN",
				message: "Cloud usage is not enabled for this organization.",
				i18nKey: "serverError.cloud.cloudUsageNotEnabled",
			});
		}
		const cloudUsage = await deps.cloudUsage(organizationId);
		const scope: CloudUsageScope = isAdmin
			? { organizationId }
			: { organizationId, userId: ctx.session.user.id };
		return next({ ctx: { scope, isAdmin, cloudUsage } });
	});

	return {
		usage: {
			query: scopedProcedure
				.input(cloudUsageInputSchema)
				.output(cloudUsageOutputSchema)
				.query(async ({ ctx, input }) => {
					if (input.groupBy === "user" && !ctx.isAdmin) {
						throw userError({
							code: "FORBIDDEN",
							message: "Only owners and admins can see usage by person.",
							i18nKey: "serverError.cloud.onlyAdminsSeeUsageByPerson",
						});
					}
					const sort =
						input.sort ?? (input.groupBy === "day" ? null : "gbHours");
					const keysetSort =
						sort === null ? "key" : sort === "gbHours" ? "gbMinutes" : sort;
					const keyset = readCursor<UsageKeyset>(
						input,
						usageKeysetSchemas[keysetSort],
					);
					const window = windowFor(input.range, anchorOf(ctx.cloudUsage));
					const { nextCursor, ...result } = await queryCloudUsage(
						deps.db,
						ctx.scope,
						{
							window,
							filters: {
								workspace: input.workspace,
								user: ctx.isAdmin ? input.user : undefined,
								size: input.size,
								status: input.status,
								search: input.search,
							},
							groupBy: input.groupBy,
							sort:
								sort === null
									? undefined
									: { by: sort, order: input.order ?? "desc" },
							limit: input.limit,
							cursor: keyset && {
								value: keyset.sort === "key" ? "0" : keyset.value,
								key: keyset.key,
							},
							overagePerGbHour: ctx.cloudUsage?.overagePerGbHour ?? null,
						},
					);
					return {
						range: window,
						...result,
						nextCursor:
							nextCursor &&
							writeCursor(
								input,
								keysetSort === "key"
									? { sort: keysetSort, key: nextCursor.key }
									: {
											sort: keysetSort,
											value: nextCursor.value,
											key: nextCursor.key,
										},
							),
					};
				}),
		},

		boots: {
			list: scopedProcedure
				.input(cloudBootsInputSchema)
				.output(cloudBootsOutputSchema)
				.query(async ({ ctx, input }) => {
					const keyset = readCursor(input, bootKeysetSchema);
					const window = windowFor(input.range, anchorOf(ctx.cloudUsage));
					const { nextCursor, ...result } = await listCloudBoots(
						deps.db,
						ctx.scope,
						{
							window,
							filters: { workspace: input.workspace },
							endReason: input.endReason,
							open: input.open,
							limit: input.limit,
							cursor: keyset && {
								startedAt: new Date(keyset.value),
								id: keyset.key,
							},
							now: new Date(),
							overagePerGbHour: ctx.cloudUsage?.overagePerGbHour ?? null,
						},
					);
					return {
						range: window,
						...result,
						nextCursor:
							nextCursor &&
							writeCursor(input, {
								sort: "startedAt",
								value: nextCursor.startedAt.toISOString(),
								key: nextCursor.id,
							}),
					};
				}),
		},

		periods: {
			/** Newest first, back to the period the organization was created in. */
			list: scopedProcedure
				.input(cloudPeriodsInputSchema)
				.output(cloudPeriodsOutputSchema)
				.query(async ({ ctx, input }) => {
					const { cloudUsage } = ctx;
					const anchor = anchorOf(cloudUsage);
					if (!cloudUsage || !anchor) return { items: [], nextCursor: null };
					const first = input.cursor
						? cloudBillingPeriodIndex(anchor, input.cursor)
						: -1;
					if (first === null) throw cursorNotValid();
					const [organization] = await deps.db
						.select({ createdAt: organizations.createdAt })
						.from(organizations)
						.where(eq(organizations.id, ctx.scope.organizationId));
					const createdAt = organization?.createdAt ?? new Date(0);
					const periods = Array.from({ length: input.limit + 1 }, (_, i) =>
						cloudBillingPeriod(anchor, first + 1 + i),
					).filter((period) => period.to > createdAt);
					const page = await queryCloudUsageByPeriod(deps.db, ctx.scope, {
						periods: periods.slice(0, input.limit),
						overagePerGbHour: cloudUsage.overagePerGbHour,
					});
					const last = page.at(-1);
					return {
						items: page.map(({ from, to, metrics }, i) => {
							const open = first === -1 && i === 0;
							return {
								id: periodId(from),
								start: from,
								end: to,
								closed: !open,
								...(!open
									? noAllowance("closed_period")
									: !ctx.isAdmin
										? noAllowance("owners_and_admins_only")
										: allowanceOf(cloudUsage, to)),
								metrics,
							};
						}),
						nextCursor:
							periods.length > input.limit && last ? periodId(last.from) : null,
					};
				}),
		},
	} satisfies TRPCRouterRecord;
}

export const cloudRouter = cloudRouterWith({
	db,
	cloudUsage: async (organizationId) =>
		billingUsesAutumn
			? (await organizationBilling(organizationId)).cloudUsage
			: null,
	flags: posthog,
});
