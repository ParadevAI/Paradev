import { z } from "zod";
import { env } from "../../../../env";
import { type CardField, CardUnavailable, defineCard } from "../types";

const flagSchema = z.object({
	id: z.number(),
	key: z.string(),
	name: z.string().optional().nullable(),
	active: z.boolean(),
	filters: z
		.object({
			groups: z
				.array(
					z.object({
						rollout_percentage: z.number().nullable().optional(),
						properties: z.array(z.unknown()).optional(),
					}),
				)
				.optional(),
		})
		.optional()
		.nullable(),
	created_at: z.string().optional(),
	created_by: z
		.object({ first_name: z.string().optional(), email: z.string().optional() })
		.optional()
		.nullable(),
});

type FlagGroups = NonNullable<
	NonNullable<z.infer<typeof flagSchema>["filters"]>["groups"]
>;

interface FlagData {
	id: number;
	key: string;
	active: boolean;
	rollout: number | null;
	/** The release conditions as PostHog holds them; a rollout change keeps every property filter. */
	groups: FlagGroups;
	url: string;
}

async function posthog<T>(
	path: string,
	schema: z.ZodType<T>,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(
		`${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}${path}`,
		{
			...init,
			headers: {
				authorization: `Bearer ${env.POSTHOG_API_KEY}`,
				...(init?.body ? { "content-type": "application/json" } : {}),
			},
			signal: AbortSignal.timeout(10_000),
		},
	);
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new CardUnavailable(
			response.status === 404 ? "gone" : "error",
			response.status === 404
				? "PostHog has no flag with that key"
				: `PostHog answered ${response.status}`,
		);
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		throw new CardUnavailable(
			"error",
			"PostHog answered in a shape this card does not know",
		);
	}
	return parsed.data;
}

function rolloutOf(flag: z.infer<typeof flagSchema>): number | null {
	const groups = flag.filters?.groups ?? [];
	if (groups.length === 0) return flag.active ? 100 : null;
	return Math.max(...groups.map((g) => g.rollout_percentage ?? 100));
}

/**
 * The decision with the widest blast radius on the launch list. This card
 * runs against the organization's PostHog project through the API's own key,
 * which is the one credential PostHog has here; the reader is named in the
 * outcome the agent receives, not in PostHog's audit log.
 */
export const posthogFeatureFlag = defineCard<{ key: string }, FlagData>({
	type: "posthog.feature_flag",
	label: "PostHog feature flag",
	ask: "Enable flag",
	brand: "posthog",
	refs: z.object({ key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/i) }),
	async resolve({ refs }) {
		const page = await posthog(
			`/feature_flags/?search=${encodeURIComponent(refs.key)}&limit=20`,
			z.object({ results: z.array(flagSchema) }),
		);
		const flag = page.results.find((f) => f.key === refs.key);
		if (!flag)
			throw new CardUnavailable("gone", `PostHog has no flag "${refs.key}"`);
		const rollout = rolloutOf(flag);
		const url = `${env.POSTHOG_API_HOST}/project/${env.POSTHOG_PROJECT_ID}/feature_flags/${flag.id}`;
		const conditions = flag.filters?.groups?.length ?? 0;
		const fields: CardField[] = [
			{ label: "Flag", value: flag.key, href: url, mono: true },
			{
				label: "State",
				value: !flag.active
					? "Disabled"
					: rollout === null
						? "Enabled"
						: `${rollout}% of ${conditions === 0 ? "everyone" : `${conditions} ${conditions === 1 ? "condition" : "conditions"}`}`,
			},
			...(flag.created_by?.email
				? [{ label: "Created by", value: flag.created_by.email }]
				: []),
		];
		return {
			title: flag.name?.trim() || flag.key,
			subtitle: flag.key,
			status: flag.active
				? {
						tone: rollout === 100 ? "good" : "warn",
						text:
							rollout === 100
								? "Live for everyone"
								: `Live · ${rollout ?? 100}%`,
					}
				: { tone: "neutral", text: "Off" },
			fields,
			data: {
				id: flag.id,
				key: flag.key,
				active: flag.active,
				rollout,
				groups: flag.filters?.groups ?? [],
				url,
			},
		};
	},
	actions: {
		enable: {
			label: () => "Enable",
			style: "primary",
			role: "primary",
			available: (d) => (d.active ? "Already on" : true),
			confirm: (d) =>
				d.groups.length === 0
					? `Turn ${d.key} on for everyone.`
					: `Turn ${d.key} on with its current ${d.groups.length === 1 ? "condition" : `${d.groups.length} conditions`} (${d.rollout ?? 100}%).`,
			async run({ data }) {
				await posthog(
					`/feature_flags/${data.id}/`,
					z.object({ id: z.number() }),
					{ method: "PATCH", body: JSON.stringify({ active: true }) },
				);
				return {
					outcome: { active: true, rollout: data.rollout },
					notice: { tone: "good", text: `${data.key} is on` },
				};
			},
		},
		rollout: {
			label: () => "Set rollout",
			style: "secondary",
			role: "other",
			input: "Percentage, 0 to 100, applied to every condition",
			confirm: (d) =>
				`Change ${d.key}'s rollout. Its property filters stay as they are.`,
			async run({ data, input }) {
				const percent = Number((input ?? "").trim().replace(/%$/, ""));
				if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
					throw new CardUnavailable(
						"error",
						"The rollout must be a whole number from 0 to 100",
					);
				}
				const groups =
					data.groups.length === 0
						? [{ properties: [], rollout_percentage: percent }]
						: data.groups.map((group) => ({
								...group,
								rollout_percentage: percent,
							}));
				await posthog(
					`/feature_flags/${data.id}/`,
					z.object({ id: z.number() }),
					{
						method: "PATCH",
						body: JSON.stringify({ active: true, filters: { groups } }),
					},
				);
				return {
					outcome: { active: true, rollout: percent },
					notice: {
						tone: percent === 100 ? "good" : "neutral",
						text: `${data.key} is live for ${percent}%`,
					},
				};
			},
		},
		disable: {
			label: () => "Disable",
			style: "danger",
			role: "other",
			available: (d) => (d.active ? true : "Already off"),
			confirm: (d) => `Turn ${d.key} off for everyone.`,
			async run({ data }) {
				await posthog(
					`/feature_flags/${data.id}/`,
					z.object({ id: z.number() }),
					{
						method: "PATCH",
						body: JSON.stringify({ active: false }),
					},
				);
				return {
					outcome: { active: false },
					notice: { tone: "neutral", text: `${data.key} is off` },
				};
			},
		},
	},
});
