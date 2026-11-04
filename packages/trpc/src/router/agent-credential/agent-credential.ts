import * as Sentry from "@sentry/core";
import { db, dbWs } from "@superset/db/client";
import {
	agentCredentialKindValues,
	agentCredentials,
} from "@superset/db/schema";
import {
	agentCredentialToEnv,
	CHATGPT_PROVIDER,
	gatewayBaseUrl,
} from "@superset/shared/agent-credentials";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { personProcedure, userError } from "../../trpc";
import {
	accessTokenExpiresAt,
	CHATGPT_DEVICE_URL,
	ChatgptSignInError,
	type ChatgptTokens,
	chatgptIdentity,
	chatgptTokensSchema,
	pollDeviceCode,
	refreshChatgptTokens,
	requestDeviceCode,
} from "./utils/chatgpt";
import { decryptAgentCredential, encryptAgentCredential } from "./utils/crypto";
import { checkPublicEndpoint } from "./utils/public-endpoint";
import { validateAgentCredential } from "./utils/validate";

const agentId = z.string().min(1).max(64);

/** Binds a pending device code to the person who started it. */
const DEVICE_CODE_CONTEXT = "codex-device-code";

const deviceCodeHandleSchema = z.object({
	deviceAuthId: z.string(),
	userCode: z.string(),
});

/** A ChatGPT access token lasts ten days; renew well before a box sees it lapse. */
const CHATGPT_REFRESH_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

function chatgptSignInError(error: unknown): never {
	if (error instanceof ChatgptSignInError && error.reason === "unreachable") {
		throw userError({
			code: "BAD_GATEWAY",
			message: "Could not reach the provider. Try again.",
			i18nKey: "serverError.agentCredential.providerUnreachable",
		});
	}
	if (error instanceof ChatgptSignInError) {
		throw userError({
			code: "BAD_REQUEST",
			message: "OpenAI did not complete the sign-in. Start again.",
			i18nKey: "serverError.agentCredential.chatgptSignInFailed",
		});
	}
	throw error;
}

export const agentCredentialRouter = {
	/** What settings shows: which agents are signed in, never the credential. */
	list: personProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select({
				agent: agentCredentials.agent,
				kind: agentCredentials.kind,
				baseUrl: agentCredentials.baseUrl,
				provider: agentCredentials.provider,
				accountLabel: agentCredentials.accountLabel,
				lastValidatedAt: agentCredentials.lastValidatedAt,
				updatedAt: agentCredentials.updatedAt,
			})
			.from(agentCredentials)
			.where(eq(agentCredentials.userId, ctx.principal.userId))
			.orderBy(asc(agentCredentials.agent));
		return rows;
	}),

	set: personProcedure
		.input(
			z.object({
				agent: agentId,
				kind: z.enum(agentCredentialKindValues),
				value: z.string().min(1).max(8192),
				baseUrl: z.string().url().max(2048).optional(),
				/** Which custom provider the value came from; picks the check to run. */
				provider: z.enum(["gateway"]).optional(),
				accountLabel: z.string().max(200).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const value = input.value.trim();
			if (!value) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Enter a value.",
					i18nKey: "serverError.agentCredential.empty",
				});
			}
			if (!Object.keys(agentCredentialToEnv({ ...input, value })).length) {
				throw userError({
					code: "BAD_REQUEST",
					message: `${input.agent} cannot be signed in this way yet.`,
					i18nKey: "serverError.agentCredential.unsupported",
					params: { agent: input.agent },
				});
			}

			const baseUrl =
				input.baseUrl ??
				(input.provider === "gateway"
					? (gatewayBaseUrl(input.agent) ?? undefined)
					: undefined);
			if (baseUrl) {
				const endpoint = await checkPublicEndpoint(baseUrl);
				if (!endpoint.ok) {
					const refusal = {
						"not-https": {
							message: "The endpoint must use https.",
							i18nKey: "serverError.agentCredential.insecureEndpoint",
						},
						unresolvable: {
							message: "That endpoint could not be resolved.",
							i18nKey: "serverError.agentCredential.unresolvableEndpoint",
						},
						restricted: {
							message: "That endpoint is not allowed.",
							i18nKey: "serverError.agentCredential.restrictedEndpoint",
						},
					}[endpoint.reason];
					throw userError({ code: "BAD_REQUEST", ...refusal });
				}
			}
			if (input.provider === "gateway" && input.kind !== "api_key") {
				throw userError({
					code: "BAD_REQUEST",
					message: "A gateway is signed in with an API key.",
					i18nKey: "serverError.agentCredential.gatewayNeedsApiKey",
				});
			}

			const check = await validateAgentCredential({
				agent: input.agent,
				kind: input.kind,
				value,
				baseUrl,
				provider: input.provider,
			});
			if (!check.ok) {
				throw userError({
					code: "BAD_REQUEST",
					message: check.message ?? "The provider refused it.",
					i18nKey:
						check.i18nKey ?? "serverError.agentCredential.providerUnreachable",
					...(check.params ? { params: check.params } : {}),
				});
			}

			const encryptedValue = encryptAgentCredential(value, {
				userId: ctx.principal.userId,
				agent: input.agent,
			});
			const row = {
				userId: ctx.principal.userId,
				agent: input.agent,
				kind: input.kind,
				encryptedValue,
				baseUrl: baseUrl ?? null,
				provider: input.provider ?? null,
				accountLabel: input.accountLabel ?? null,
				lastValidatedAt: new Date(),
			};
			await dbWs
				.insert(agentCredentials)
				.values(row)
				.onConflictDoUpdate({
					target: [agentCredentials.userId, agentCredentials.agent],
					set: {
						kind: row.kind,
						encryptedValue: row.encryptedValue,
						baseUrl: row.baseUrl,
						provider: row.provider,
						accountLabel: row.accountLabel,
						lastValidatedAt: row.lastValidatedAt,
					},
				});
			return { agent: input.agent, kind: input.kind };
		}),

	/**
	 * Starts Codex's ChatGPT device-code sign-in. The person approves the code
	 * on OpenAI's page; the handle carries the pending code back to
	 * `pollChatgptSignIn`, sealed to them so nobody else can finish it.
	 */
	startChatgptSignIn: personProcedure.mutation(async ({ ctx }) => {
		const code = await requestDeviceCode().catch(chatgptSignInError);
		return {
			handle: encryptAgentCredential(
				JSON.stringify({
					deviceAuthId: code.deviceAuthId,
					userCode: code.userCode,
				}),
				{ userId: ctx.principal.userId, agent: DEVICE_CODE_CONTEXT },
			),
			userCode: code.userCode,
			verificationUrl: CHATGPT_DEVICE_URL,
			intervalSeconds: code.intervalSeconds,
		};
	}),

	/** One check of a pending sign-in; stores the session once it is approved. */
	pollChatgptSignIn: personProcedure
		.input(z.object({ handle: z.string().min(1).max(4096) }))
		.mutation(async ({ ctx, input }) => {
			let pending: z.infer<typeof deviceCodeHandleSchema>;
			try {
				pending = deviceCodeHandleSchema.parse(
					JSON.parse(
						decryptAgentCredential(input.handle, {
							userId: ctx.principal.userId,
							agent: DEVICE_CODE_CONTEXT,
						}),
					),
				);
			} catch {
				throw userError({
					code: "BAD_REQUEST",
					message: "OpenAI did not complete the sign-in. Start again.",
					i18nKey: "serverError.agentCredential.chatgptSignInFailed",
				});
			}
			const tokens = await pollDeviceCode(pending).catch(chatgptSignInError);
			if (!tokens) return { status: "pending" as const };

			const accountLabel = chatgptIdentity(tokens.idToken).email;
			const row = {
				userId: ctx.principal.userId,
				agent: "codex",
				kind: "subscription" as const,
				encryptedValue: encryptAgentCredential(JSON.stringify(tokens), {
					userId: ctx.principal.userId,
					agent: "codex",
				}),
				baseUrl: null,
				provider: CHATGPT_PROVIDER,
				accountLabel,
				lastValidatedAt: new Date(),
			};
			await dbWs
				.insert(agentCredentials)
				.values(row)
				.onConflictDoUpdate({
					target: [agentCredentials.userId, agentCredentials.agent],
					set: {
						kind: row.kind,
						encryptedValue: row.encryptedValue,
						baseUrl: row.baseUrl,
						provider: row.provider,
						accountLabel: row.accountLabel,
						lastValidatedAt: row.lastValidatedAt,
					},
				});
			return { status: "connected" as const, accountLabel };
		}),

	remove: personProcedure
		.input(z.object({ agent: agentId }))
		.mutation(async ({ ctx, input }) => {
			await dbWs
				.delete(agentCredentials)
				.where(
					and(
						eq(agentCredentials.userId, ctx.principal.userId),
						eq(agentCredentials.agent, input.agent),
					),
				);
			return { agent: input.agent };
		}),
} satisfies TRPCRouterRecord;

/**
 * A ChatGPT sign-in as a box needs it: the access token for the firewall and
 * who it is. Never the refresh token, and never the id token itself, which
 * OpenAI would trade for more.
 */
export interface CodexChatgptSignIn {
	accessToken: string;
	accountId: string;
	identity: ReturnType<typeof chatgptIdentity>;
}

export interface AgentSignIns {
	/** What each signed-in agent reads from its environment. */
	env: Record<string, string>;
	codexChatgpt: CodexChatgptSignIn | null;
}

type AgentCredentialRow = typeof agentCredentials.$inferSelect;

function decryptRow(row: AgentCredentialRow): string {
	return decryptAgentCredential(row.encryptedValue, {
		userId: row.userId,
		agent: row.agent,
	});
}

function isFresh(tokens: ChatgptTokens): boolean {
	const expiresAt = accessTokenExpiresAt(tokens.accessToken);
	return (
		!!expiresAt && expiresAt.getTime() - Date.now() > CHATGPT_REFRESH_WINDOW_MS
	);
}

interface ChatgptSession {
	/** Null once OpenAI refuses the session for good. */
	tokens: ChatgptTokens | null;
	renewed: boolean;
}

/**
 * The stored ChatGPT session, renewed first when its access token is close to
 * expiring. The row is locked for the renewal: a refresh token works once, so
 * two boxes renewing together would sign the person out. Only a refusal that
 * proves the session is dead removes the row, so Settings asks for a new
 * sign-in; any other failure keeps it for the next try.
 */
async function currentChatgptSession(
	row: AgentCredentialRow,
): Promise<ChatgptSession> {
	const stored = chatgptTokensSchema.parse(JSON.parse(decryptRow(row)));
	if (isFresh(stored)) return { tokens: stored, renewed: false };
	const save = (tokens: ChatgptTokens) => ({
		encryptedValue: encryptAgentCredential(JSON.stringify(tokens), {
			userId: row.userId,
			agent: row.agent,
		}),
		lastValidatedAt: new Date(),
	});
	let renewed: ChatgptTokens | null = null;
	try {
		return await dbWs.transaction(async (tx) => {
			const [locked] = await tx
				.select()
				.from(agentCredentials)
				.where(eq(agentCredentials.id, row.id))
				.for("update");
			if (!locked) return { tokens: stored, renewed: false };
			const current = chatgptTokensSchema.parse(JSON.parse(decryptRow(locked)));
			if (isFresh(current)) return { tokens: current, renewed: false };
			renewed = await refreshChatgptTokens(current);
			await tx
				.update(agentCredentials)
				.set(save(renewed))
				.where(eq(agentCredentials.id, locked.id));
			return { tokens: renewed, renewed: true };
		});
	} catch (error) {
		if (renewed) {
			await dbWs
				.update(agentCredentials)
				.set(save(renewed))
				.where(eq(agentCredentials.id, row.id))
				.catch((saveError) => {
					console.error(
						"[agent-credential] renewed ChatGPT sign-in was not saved",
						saveError,
					);
					Sentry.captureException(saveError, {
						extra: { credentialId: row.id },
					});
				});
			return { tokens: renewed, renewed: true };
		}
		const code = error instanceof ChatgptSignInError ? error.code : undefined;
		if (error instanceof ChatgptSignInError && error.reason === "rejected") {
			console.warn(
				`[agent-credential] OpenAI refused the ChatGPT sign-in (${code}); removing it`,
			);
			Sentry.captureMessage("ChatGPT sign-in refused; removed", {
				level: "warning",
				extra: { credentialId: row.id, code },
			});
			await dbWs
				.delete(agentCredentials)
				.where(eq(agentCredentials.id, row.id));
			return { tokens: null, renewed: false };
		}
		console.warn("[agent-credential] ChatGPT sign-in was not renewed", error);
		Sentry.captureException(error, {
			extra: { credentialId: row.id, code },
		});
		return { tokens: stored, renewed: false };
	}
}

/**
 * Renews every ChatGPT sign-in close to expiring, whether or not a box is
 * running, so a session nobody uses for a while does not lapse. Returns who
 * was renewed, whose running boxes still carry the old token.
 */
export async function renewChatgptSignIns(args: {
	deadline: number;
}): Promise<{ checked: number; renewedUserIds: string[] }> {
	const rows = await db
		.select()
		.from(agentCredentials)
		.where(
			and(
				eq(agentCredentials.agent, "codex"),
				eq(agentCredentials.provider, CHATGPT_PROVIDER),
			),
		);
	const renewedUserIds: string[] = [];
	let checked = 0;
	for (const row of rows) {
		if (Date.now() > args.deadline) break;
		checked++;
		try {
			const session = await currentChatgptSession(row);
			if (session.renewed) renewedUserIds.push(row.userId);
		} catch (error) {
			Sentry.captureException(error, { extra: { credentialId: row.id } });
		}
	}
	return { checked, renewedUserIds };
}

/**
 * What every agent a person has signed in contributes to a cloud workspace
 * they start — not only the one launched with it, since any of them can be
 * started from a terminal later. Server-side only: the plaintext never leaves
 * this process except on the sandbox it was fetched for.
 */
export async function resolveAgentSignIns(args: {
	userId: string;
}): Promise<AgentSignIns> {
	const rows = await db
		.select()
		.from(agentCredentials)
		.where(eq(agentCredentials.userId, args.userId));
	const env: Record<string, string> = {};
	let codexChatgpt: CodexChatgptSignIn | null = null;
	for (const row of rows) {
		if (row.agent === "codex" && row.provider === CHATGPT_PROVIDER) {
			const { tokens } = await currentChatgptSession(row);
			if (!tokens) continue;
			codexChatgpt = {
				accessToken: tokens.accessToken,
				accountId: tokens.accountId,
				identity: chatgptIdentity(tokens.idToken),
			};
			continue;
		}
		Object.assign(
			env,
			agentCredentialToEnv({
				agent: row.agent,
				kind: row.kind,
				value: decryptRow(row),
				baseUrl: row.baseUrl,
				provider: row.provider,
			}),
		);
	}
	return { env, codexChatgpt };
}
