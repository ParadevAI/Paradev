import { z } from "zod";
import {
	type AgentNeedsView,
	type CardField,
	CardUnavailable,
	defineCard,
} from "../types";
import { loadWorkspace } from "./supersetWorkspace";

export const CREDENTIAL_SERVICES = [
	"github",
	"gmail",
	"slack",
	"linear",
	"posthog",
	"stripe",
	"sentry",
	"vercel",
	"notion",
	"other",
] as const;

const SERVICE_LABEL: Record<(typeof CREDENTIAL_SERVICES)[number], string> = {
	github: "GitHub",
	gmail: "Gmail",
	slack: "Slack",
	linear: "Linear",
	posthog: "PostHog",
	stripe: "Stripe",
	sentry: "Sentry",
	vercel: "Vercel",
	notion: "Notion",
	other: "another service",
};

const NEEDS = ["credential", "tool", "question"] as const;
const IDENTIFIER = /^[a-zA-Z0-9_.:,\- ]+$/;

const refsSchema = z
	.object({
		need: z.enum(NEEDS),
		/** The workspace the agent is working in, drawn above what it needs. */
		workspace: z.string().uuid().optional(),
		/** The machine a local workspace lives on; cloud workspaces need none. */
		host: z
			.string()
			.regex(/^[a-zA-Z0-9_-]{1,128}$/)
			.optional(),

		service: z.enum(CREDENTIAL_SERVICES).optional(),
		scope: z.string().regex(IDENTIFIER).max(200).optional(),
		/** The tool by name, e.g. "Bash" or "gh pr merge"; never the agent's full command. */
		tool: z.string().regex(IDENTIFIER).max(120).optional(),
		/** The id of the ask question in this card's document that the card answers. */
		question: z
			.string()
			.regex(/^[a-z0-9_-]{1,64}$/i)
			.optional(),
	})
	.refine((refs) => refs.need !== "credential" || refs.service, {
		message: "A credential need names its service",
	})
	.refine((refs) => refs.need !== "tool" || refs.tool, {
		message: "A tool need names the tool",
	})
	.refine((refs) => refs.need !== "question" || refs.question, {
		message: "A question need names the ask question it answers",
	});
type Refs = z.infer<typeof refsSchema>;

interface Data {
	need: Refs["need"];
	service: string | null;
	tool: string | null;
}

const TITLE: Record<Refs["need"], (refs: Refs) => string> = {
	credential: (refs) => `Connect ${SERVICE_LABEL[refs.service ?? "other"]}`,
	tool: (refs) => `Allow ${refs.tool}`,
	question: () => "Answer the agent",
};

/**
 * An agent is blocked on the person: an account to connect, a tool it should
 * not run without a yes, or a question. The card shows where the agent is
 * working and takes the answer; the agent receives it through `wait`.
 */
export const agentNeeds = defineCard<Refs, Data>({
	type: "superset.agent_needs",
	label: "Agent needs you",
	ask: "Answer",
	brand: "superset",
	refs: refsSchema,
	takesDecision: (refs) => refs.need !== "question",
	async resolve({ refs, ctx }) {
		const workspace = refs.workspace
			? await loadWorkspace(
					ctx.organizationId,
					ctx.readerId,
					refs.workspace,
					refs.host ?? ctx.card?.hostId ?? undefined,
				)
					.then((loaded) => loaded.view)
					.catch((error: unknown) => {
						if (error instanceof CardUnavailable) return null;
						throw error;
					})
			: null;
		const service = refs.service ? SERVICE_LABEL[refs.service] : null;
		const fields: CardField[] = [
			...(workspace ? [{ label: "Workspace", value: workspace.name }] : []),
			...(service ? [{ label: "Service", value: service }] : []),
			...(refs.scope
				? [{ label: "Scope", value: refs.scope, mono: true }]
				: []),
			...(refs.tool ? [{ label: "Tool", value: refs.tool, mono: true }] : []),
		];
		const view: AgentNeedsView = {
			kind: "superset.agent_needs",
			need: refs.need,
			workspace,
			service:
				refs.service && service ? { id: refs.service, label: service } : null,
			scope: refs.scope ?? null,
			tool: refs.tool ?? null,
			questionId: refs.question ?? null,
		};
		return {
			title: TITLE[refs.need](refs),
			subtitle: workspace?.name,
			fields,
			view,
			data: { need: refs.need, service, tool: refs.tool ?? null },
		};
	},
	actions: {
		connected: {
			label: (d) => `I connected ${d.service ?? "it"}`,
			style: "primary",
			role: "primary",
			applies: (d) => d.need === "credential",
			async run() {
				return { outcome: { connected: true } };
			},
		},
		declined: {
			label: () => "Not granting this",
			style: "secondary",
			role: "dismiss",
			input: "Tell the agent what to do instead",
			applies: (d) => d.need === "credential",
			async run({ input }) {
				return {
					outcome: { connected: false, ...(input ? { note: input } : {}) },
				};
			},
		},
		approve: {
			label: (d) => `Allow ${d.tool ?? "it"}`,
			style: "primary",
			role: "primary",
			applies: (d) => d.need === "tool",
			async run() {
				return {
					outcome: { approved: true },
					notice: { tone: "good", text: "Allowed" },
				};
			},
		},
		deny: {
			label: () => "Don't allow",
			style: "secondary",
			role: "dismiss",
			input: "Tell the agent what to do instead",
			applies: (d) => d.need === "tool",
			async run({ input }) {
				return {
					outcome: { approved: false, ...(input ? { note: input } : {}) },
					notice: { tone: "neutral", text: "Not allowed" },
				};
			},
		},
	},
});
