import { db } from "@superset/db/client";
import { organizations } from "@superset/db/schema";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	realtimeToolDefinitions,
	VOICE_CONTEXT_TOKEN_LIMIT,
	VOICE_DEFAULT_REASONING_EFFORT,
	VOICE_DEFAULT_SPEED,
	VOICE_DEFAULT_VOICE,
	VOICE_MAX_SESSION_SECONDS,
	VOICE_REALTIME_MODEL,
	VOICE_SECRET_TTL_SECONDS,
	VOICE_TRANSCRIPTION_MODEL,
	voiceInstructions,
	voiceSessionSettingsSchema,
} from "@superset/shared/voice";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { eq } from "drizzle-orm";
import { env } from "../../env";
import { posthog } from "../../lib/analytics";
import {
	mintRealtimeClientSecret,
	RealtimeMintError,
} from "../../lib/openai/realtime";
import {
	TranscriptionError,
	transcribeAudio,
} from "../../lib/openai/transcription";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { dictationAudioExtension, transcribeSchema } from "./schema";

// Under the route's maxDuration, so a stalled upstream fails as BAD_GATEWAY.
const TRANSCRIBE_TIMEOUT_MS = 120_000;

const transcribeRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(100, "1 h"),
				prefix: "ratelimit:voice:transcribe",
			})
		: null;

async function assertTranscribeRateLimit(userId: string) {
	if (!transcribeRateLimit) {
		if (env.NODE_ENV === "production") {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Dictation rate limiting is not configured.",
			});
		}
		console.warn(
			"[voice/transcribe] rate limit skipped because KV is not configured",
		);
		return;
	}
	// A limiter outage lets the call through: losing a dictation costs the
	// user more than one unmetered clip costs the key.
	const success = await transcribeRateLimit.limit(userId).then(
		(result) => result.success,
		(error: unknown) => {
			console.error("[voice/transcribe] rate limit check failed", error);
			return true;
		},
	);
	if (!success) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many dictations. Try again later.",
		});
	}
}

export const voiceRouter = {
	/**
	 * Mints the short-lived secret the phone connects to OpenAI with. The
	 * session (model, voice, instructions, tool schema) is fixed here, so the
	 * API key never leaves the server and the tool list cannot drift from
	 * what the device executes.
	 */
	createSession: protectedProcedure
		.input(voiceSessionSettingsSchema.optional())
		.mutation(async ({ ctx, input }) => {
			if (!env.SERVER_OPENAI_API_KEY) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Voice mode is not configured on this server.",
				});
			}
			// Undefined when PostHog cannot answer, which refuses: every session
			// spends on the shared OpenAI key.
			const organizationLookup = requireActiveOrgMembership(ctx).then(
				(organizationId) =>
					db.query.organizations.findFirst({
						where: eq(organizations.id, organizationId),
						columns: { name: true },
					}),
			);
			organizationLookup.catch(() => {});
			const enabled = await posthog.isFeatureEnabled(
				FEATURE_FLAGS.MOBILE_VOICE_MODE,
				ctx.session.user.id,
				{
					personProperties: { email: ctx.session.user.email.toLowerCase() },
					sendFeatureFlagEvents: false,
				},
			);
			if (!enabled) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Voice mode is not enabled for this account.",
				});
			}
			const organization = await organizationLookup;
			try {
				const secret = await mintRealtimeClientSecret({
					apiKey: env.SERVER_OPENAI_API_KEY,
					model: VOICE_REALTIME_MODEL,
					voice: input?.voice ?? VOICE_DEFAULT_VOICE,
					reasoningEffort:
						input?.reasoningEffort ?? VOICE_DEFAULT_REASONING_EFFORT,
					speed: input?.speed ?? VOICE_DEFAULT_SPEED,
					transcriptionModel: VOICE_TRANSCRIPTION_MODEL,
					ttlSeconds: VOICE_SECRET_TTL_SECONDS,
					contextTokenLimit: VOICE_CONTEXT_TOKEN_LIMIT,
					tools: realtimeToolDefinitions(),
					instructions: voiceInstructions({
						userName: ctx.session.user.name ?? null,
						organizationName: organization?.name ?? null,
					}),
					safetyIdentifier: ctx.session.user.id,
				});
				return {
					clientSecret: secret.value,
					expiresAt: secret.expiresAt,
					model: VOICE_REALTIME_MODEL,
					maxSessionSeconds: VOICE_MAX_SESSION_SECONDS,
				};
			} catch (error) {
				if (error instanceof RealtimeMintError) {
					throw new TRPCError({
						code: error.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY",
						message: "Could not start a voice session. Try again in a moment.",
						cause: error,
					});
				}
				throw error;
			}
		}),

	transcribe: protectedProcedure
		.input(transcribeSchema)
		.mutation(async ({ ctx, input }) => {
			if (!env.SERVER_OPENAI_API_KEY) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Dictation is not configured on this server.",
				});
			}
			await requireActiveOrgMembership(ctx);
			await assertTranscribeRateLimit(ctx.session.user.id);
			const audio = new Uint8Array(Buffer.from(input.audio, "base64"));
			try {
				const text = await transcribeAudio({
					apiKey: env.SERVER_OPENAI_API_KEY,
					model: VOICE_TRANSCRIPTION_MODEL,
					audio,
					fileName: `dictation.${dictationAudioExtension(input.mimeType)}`,
					mimeType: input.mimeType,
					signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
				});
				return { text };
			} catch (error) {
				if (error instanceof TranscriptionError && error.status === 429) {
					throw new TRPCError({
						code: "TOO_MANY_REQUESTS",
						message: "Dictation is busy. Try again in a moment.",
						cause: error,
					});
				}
				if (error instanceof TranscriptionError && error.status === 400) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Could not transcribe this recording.",
						cause: error,
					});
				}
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "Could not transcribe audio. Try again in a moment.",
					cause: error,
				});
			}
		}),
} satisfies TRPCRouterRecord;
