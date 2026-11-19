import type {
	CloudBootsResult,
	CloudUsageMetrics,
	CloudUsageResult,
	CloudUsageWindow,
} from "@superset/db/cloud-usage-query";
import {
	cloudUsageGroupByValues,
	cloudUsageSortValues,
} from "@superset/db/cloud-usage-query";
import {
	cloudWorkspaceBootEndReasonEnum,
	cloudWorkspaceStatusEnum,
} from "@superset/db/enums";
import { machineSizeSchema } from "@superset/shared/billing";
import * as api from "@superset/shared/cloud-usage-api";
import { z } from "zod";

const rangePresetSchema = z.enum(["24h", "7d", "30d", "90d"]);

export type RangePreset = z.infer<typeof rangePresetSchema>;

const rangeSchema = z.union([
	rangePresetSchema,
	z
		.object({ from: z.coerce.date(), to: z.coerce.date() })
		.refine(({ from, to }) => from < to, "from must be before to"),
	z.object({ period: z.union([z.literal("current"), z.iso.date()]) }),
]);

export type CloudRange = z.infer<typeof rangeSchema>;

const limitSchema = z.number().int().min(1).max(100).default(25);

const cloudListInputSchema = z.object({
	workspace: z.uuid().optional(),
	range: rangeSchema,
	limit: limitSchema,
	cursor: z.string().optional(),
});

export const cloudUsageInputSchema = cloudListInputSchema
	.extend({
		groupBy: z.enum(cloudUsageGroupByValues).optional(),
		/** Owners and admins only: a member always gets their own rows. */
		user: z.uuid().optional(),
		size: machineSizeSchema.optional(),
		status: z.array(cloudWorkspaceStatusEnum).optional(),
		search: z.string().max(200).optional(),
		sort: z.enum(cloudUsageSortValues).optional(),
		order: z.enum(["asc", "desc"]).optional(),
	})
	.refine(
		({ sort, groupBy }) =>
			(sort !== "name" && sort !== "status") || groupBy === "workspace",
		"sort by name or status needs groupBy workspace",
	);

const decimalSchema = z.string().regex(/^\d+(\.\d+)?$/);

const valueKeyset = <Sort extends string>(sort: Sort, value = decimalSchema) =>
	z.object({ sort: z.literal(sort), value, key: z.string() });

/**
 * Inside the opaque usage cursor, by sort. `value` is cast to numeric in SQL, so it must be decimal
 * digits, except for a name. GB-hours keep the name `gbMinutes` they had before other sorts.
 */
export const usageKeysetSchemas = {
	gbMinutes: valueKeyset("gbMinutes"),
	hours: valueKeyset("hours"),
	boots: valueKeyset("boots"),
	status: valueKeyset("status"),
	name: valueKeyset("name", z.string()),
	key: z.object({ sort: z.literal("key"), key: z.string() }),
};

export type UsageKeyset = z.infer<
	(typeof usageKeysetSchemas)[keyof typeof usageKeysetSchemas]
>;

/** Inside the opaque boots cursor. */
export const bootKeysetSchema = z.object({
	sort: z.literal("startedAt"),
	value: z.iso.datetime(),
	key: z.string(),
});

export const cloudBootsInputSchema = cloudListInputSchema.extend({
	endReason: z.array(cloudWorkspaceBootEndReasonEnum).optional(),
	open: z.boolean().optional(),
});

export type CloudListFilters = Omit<
	z.infer<typeof cloudUsageInputSchema> & z.infer<typeof cloudBootsInputSchema>,
	"limit" | "cursor"
>;

export const cloudPeriodsInputSchema = z.object({
	limit: z.number().int().min(1).max(24).default(6),
	cursor: z.iso.date().optional(),
});

type Page<Result> = Omit<Result, "nextCursor"> & {
	range: CloudUsageWindow;
	nextCursor: string | null;
};

export const cloudUsageOutputSchema =
	api.cloudUsageOutputSchema satisfies z.ZodType<Page<CloudUsageResult>>;
export const cloudBootsOutputSchema =
	api.cloudBootsOutputSchema satisfies z.ZodType<Page<CloudBootsResult>>;
export const cloudPeriodsOutputSchema = api.cloudPeriodsOutputSchema;
api.metricsSchema satisfies z.ZodType<CloudUsageMetrics>;
api.windowSchema satisfies z.ZodType<CloudUsageWindow>;
