import { MACHINE_SIZES } from "@superset/shared/billing";
import { z } from "zod";
import {
	cloudWorkspaceBootEndReasonEnum,
	cloudWorkspaceFailureReasonEnum,
	cloudWorkspaceStatusEnum,
} from "./schema/enums";

export const machineSizeSchema = z.enum(MACHINE_SIZES);

export const rangePresetDays = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

export const rangeSchema = z.union([
	z.enum(Object.keys(rangePresetDays) as [keyof typeof rangePresetDays]),
	z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
	z.object({ period: z.union([z.literal("current"), z.iso.date()]) }),
]);
export type Range = z.infer<typeof rangeSchema>;

export const resolvedRangeSchema = z.object({
	from: z.iso.datetime(),
	to: z.iso.datetime(),
});

export const cloudUsageFiltersSchema = z.object({
	user: z.uuid().optional(),
	workspace: z.uuid().optional(),
	size: machineSizeSchema.optional(),
	status: z.array(cloudWorkspaceStatusEnum).optional(),
});
export type CloudUsageFilters = z.infer<typeof cloudUsageFiltersSchema>;

export const userRefSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

export const workspaceRefSchema = z.object({
	id: z.string(),
	name: z.string(),
});

export const workspaceFailureSchema = z.object({
	reason: cloudWorkspaceFailureReasonEnum,
	at: z.iso.datetime(),
});

export const workspaceSummarySchema = workspaceRefSchema.extend({
	status: cloudWorkspaceStatusEnum,
	size: machineSizeSchema,
	owner: userRefSchema.nullable(),
	failure: workspaceFailureSchema.nullable(),
});

export const metricsSchema = z.object({
	workspaces: z.number().int(),
	boots: z.number().int(),
	failedBoots: z.number().int(),
	hours: z.number(),
	gbHours: z.number(),
	usageUsd: z.number().nullable(),
});
export type Metrics = z.infer<typeof metricsSchema>;

export const allowanceSchema = z.object({
	includedGbHours: z.number().nullable(),
	usedGbHours: z.number(),
	overageGbHours: z.number(),
	prepaidRemainingGbHours: z.number(),
	resetsAt: z.iso.datetime(),
});
export type Allowance = z.infer<typeof allowanceSchema>;

export const periodSchema = z.object({
	id: z.iso.date(),
	start: z.iso.datetime(),
	end: z.iso.datetime(),
	closed: z.boolean(),
	allowance: allowanceSchema.nullable(),
	metrics: metricsSchema,
});

export const bootSchema = z.object({
	id: z.string(),
	sessionId: z.string().nullable(),
	workspace: workspaceRefSchema.nullable(),
	user: userRefSchema.nullable(),
	startedAt: z.iso.datetime(),
	stoppedAt: z.iso.datetime().nullable(),
	minutes: z.number(),
	size: machineSizeSchema.nullable(),
	memoryGb: z.number(),
	vcpus: z.number().int(),
	endReason: cloudWorkspaceBootEndReasonEnum.nullable(),
	gbHours: z.number(),
	usageUsd: z.number().nullable(),
});

export const usageGroupByValues = ["user", "day", "workspace"] as const;
export type UsageGroupBy = (typeof usageGroupByValues)[number];

export const usageItemSchema = metricsSchema.extend({
	key: z.string().nullable(),
	label: z.string().nullable(),
	ref: z.union([workspaceSummarySchema, userRefSchema]).nullable(),
});

export function listSchema<Item extends z.ZodType>(item: Item) {
	return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const usageResultSchema = listSchema(usageItemSchema).extend({
	range: resolvedRangeSchema,
	groupBy: z.enum(usageGroupByValues).nullable(),
	total: metricsSchema,
});

export const bootsResultSchema = listSchema(bootSchema).extend({
	range: resolvedRangeSchema,
});

export const periodsResultSchema = listSchema(periodSchema);
