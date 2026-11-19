import { z } from "zod";
import {
	ALLOWANCE_UNAVAILABLE_FIELDS,
	ALLOWANCE_UNAVAILABLE_REASONS,
	machineSizeSchema,
} from "./billing";
import {
	cloudWorkspaceBootEndReasonEnum,
	cloudWorkspaceFailureReasonEnum,
	cloudWorkspaceStatusEnum,
} from "./cloud-workspace-status";

/** The cloud router's outputs. The router validates against these and packages/ui reads its types from them. */
export const windowSchema = z.object({
	from: z.date(),
	to: z.date(),
});

const userRefSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

export const metricsSchema = z.object({
	workspaces: z.number(),
	boots: z.number(),
	failedBoots: z.number(),
	hours: z.number(),
	gbHours: z.number(),
	usageUsd: z.number().nullable(),
});

export const cloudUsageOutputSchema = z.object({
	range: windowSchema,
	items: z.array(
		metricsSchema.extend({
			key: z.string().nullable(),
			label: z.string().nullable(),
			/** Grouped by user only: the person's usage on each UTC day that has any. */
			days: z
				.array(
					z.object({
						day: z.iso.date(),
						gbHours: z.number(),
						usageUsd: z.number().nullable(),
					}),
				)
				.optional(),
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
						lastBoot: z
							.object({
								endReason: cloudWorkspaceBootEndReasonEnum.nullable(),
								stoppedAt: z.date().nullable(),
							})
							.nullable(),
					}),
					userRefSchema,
				])
				.nullable(),
		}),
	),
	total: metricsSchema,
	/**
	 * Rows across every page; 0 with no groupBy. Grouped by workspace it counts the one row of usage
	 * with no workspace (key null), which `total.workspaces` does not.
	 */
	rowCount: z.number(),
	nextCursor: z.string().nullable(),
});

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
});

/** A value the page shows that billing does not hold for this period, and why. */
const periodUnavailableSchema = z.object({
	field: z.enum(["allowance", ...ALLOWANCE_UNAVAILABLE_FIELDS]),
	reason: z.enum([
		"closed_period",
		"owners_and_admins_only",
		...ALLOWANCE_UNAVAILABLE_REASONS,
	]),
});

export type CloudPeriodUnavailable = z.infer<typeof periodUnavailableSchema>;

/** Null when there is none of it. */
const creditLineSchema = z
	.object({
		usedGbHours: z.number(),
		totalGbHours: z.number(),
		usedUsd: z.number().nullable(),
		totalUsd: z.number().nullable(),
	})
	.nullable();

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
					usedUsd: z.number().nullable(),
					includedUsd: z.number().nullable(),
					overageUsd: z.number().nullable(),
					seats: z.number().nullable(),
					bought: creditLineSchema,
					freeCredits: creditLineSchema,
					/** Null with no cap, or with an `unavailable` entry when the cap is not known. */
					extraUsageLimit: z
						.object({ gbHours: z.number(), usd: z.number().nullable() })
						.nullable(),
					/** True at the cap: nothing left with overage off, or the absolute cap used up. */
					limitReached: z.boolean().nullable(),
				})
				.nullable(),
			unavailable: z.array(periodUnavailableSchema),
			metrics: metricsSchema,
		}),
	),
	nextCursor: z.iso.date().nullable(),
});
