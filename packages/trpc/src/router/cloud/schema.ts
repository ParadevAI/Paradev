import type {
	CloudBootsResult,
	CloudUsageMetrics,
	CloudUsageResult,
	CloudUsageWindow,
} from "@superset/db/cloud-usage-query";
import { cloudUsageGroupByValues } from "@superset/db/cloud-usage-query";
import {
	cloudWorkspaceBootEndReasonEnum,
	cloudWorkspaceFailureReasonEnum,
	cloudWorkspaceStatusEnum,
} from "@superset/db/enums";
import { machineSizeSchema } from "@superset/shared/billing";
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

const pageInputSchema = z.object({
	workspace: z.uuid().optional(),
	range: rangeSchema,
	limit: limitSchema,
	cursor: z.string().optional(),
});

export const cloudUsageInputSchema = pageInputSchema.extend({
	groupBy: z.enum(cloudUsageGroupByValues).optional(),
});

/** Inside the opaque usage cursor. `value` is cast to numeric in SQL, so it must be decimal digits. */
export const usageKeysetSchema = z.discriminatedUnion("sort", [
	z.object({
		sort: z.literal("gbMinutes"),
		value: z.string().regex(/^\d+(\.\d+)?$/),
		key: z.string(),
	}),
	z.object({ sort: z.literal("key"), key: z.string() }),
]);

/** Inside the opaque boots cursor. */
export const bootKeysetSchema = z.object({
	sort: z.literal("startedAt"),
	value: z.iso.datetime(),
	key: z.string(),
});

export const cloudBootsInputSchema = pageInputSchema.extend({
	endReason: z.array(cloudWorkspaceBootEndReasonEnum).optional(),
	open: z.boolean().optional(),
});

export const cloudPeriodsInputSchema = z.object({
	limit: z.number().int().min(1).max(24).default(6),
	cursor: z.iso.date().optional(),
});

const windowSchema = z.object({
	from: z.date(),
	to: z.date(),
}) satisfies z.ZodType<CloudUsageWindow>;

type Page<Result> = Omit<Result, "nextCursor"> & {
	range: CloudUsageWindow;
	nextCursor: string | null;
};

const userRefSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

const metricsSchema = z.object({
	workspaces: z.number(),
	boots: z.number(),
	failedBoots: z.number(),
	hours: z.number(),
	gbHours: z.number(),
	usageUsd: z.number().nullable(),
}) satisfies z.ZodType<CloudUsageMetrics>;

export const cloudUsageOutputSchema = z.object({
	range: windowSchema,
	items: z.array(
		metricsSchema.extend({
			key: z.string().nullable(),
			label: z.string().nullable(),
			ref: z
				.union([
					z.object({
						id: z.string(),
						name: z.string(),
						status: cloudWorkspaceStatusEnum,
						size: machineSizeSchema,
						owner: userRefSchema.nullable(),
						failure: z
							.object({ reason: cloudWorkspaceFailureReasonEnum, at: z.date() })
							.nullable(),
					}),
					userRefSchema,
				])
				.nullable(),
		}),
	),
	total: metricsSchema,
	nextCursor: z.string().nullable(),
}) satisfies z.ZodType<Page<CloudUsageResult>>;

export const cloudBootsOutputSchema = z.object({
	range: windowSchema,
	items: z.array(
		z.object({
			id: z.string(),
			sessionId: z.string().nullable(),
			workspace: z.object({ id: z.string(), name: z.string() }).nullable(),
			user: userRefSchema.nullable(),
			startedAt: z.date(),
			stoppedAt: z.date().nullable(),
			minutes: z.number(),
			size: machineSizeSchema.nullable(),
			memoryGb: z.number(),
			vcpus: z.number(),
			endReason: cloudWorkspaceBootEndReasonEnum.nullable(),
			gbHours: z.number(),
			usageUsd: z.number().nullable(),
		}),
	),
	nextCursor: z.string().nullable(),
}) satisfies z.ZodType<Page<CloudBootsResult>>;

export const cloudPeriodsOutputSchema = z.object({
	items: z.array(
		z.object({
			id: z.iso.date(),
			start: z.date(),
			end: z.date(),
			closed: z.boolean(),
			allowance: z
				.object({
					includedGbHours: z.number().nullable(),
					usedGbHours: z.number(),
					overageGbHours: z.number(),
					prepaidRemainingGbHours: z.number(),
					resetsAt: z.date(),
				})
				.nullable(),
			metrics: metricsSchema,
		}),
	),
	nextCursor: z.iso.date().nullable(),
});
