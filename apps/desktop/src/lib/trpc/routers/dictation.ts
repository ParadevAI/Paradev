import { app, net } from "electron";
import {
	createCodexTranscriber,
	readCodexChatGptToken,
} from "main/lib/codex-transcriber";
import {
	findTranscriberBinary,
	type NativeTranscription,
	transcribeNatively,
} from "main/lib/native-transcriber";
import { z } from "zod";
import { publicProcedure, router } from "..";
import { getProcessEnvWithShellPath } from "./workspaces/utils/shell-env";

export type DesktopTranscriptionResult = NativeTranscription & {
	engine?: "chatgpt" | "mac";
	// Why ChatGPT was not used when Codex is signed in to it.
	chatgptError?: string;
};

// Ten minutes of 16 kHz mono 16-bit WAV, base64-encoded, with headroom.
const MAX_WAV_BASE64_LENGTH = 32 * 1024 * 1024;
// For ChatGPT and the Mac together; past it the renderer uses the API.
const DESKTOP_DEADLINE_MS = 45_000;

function transcriberBinary() {
	return findTranscriberBinary({
		isPackaged: app.isPackaged,
		resourcesPath: process.resourcesPath,
		appPath: app.getAppPath(),
	});
}

export const createDictationRouter = () => {
	const codex = createCodexTranscriber({
		// Chromium's stack keeps the cookies chatgpt.com's Cloudflare sets.
		fetchImpl: (url, init) => net.fetch(url, init),
		readToken: async (refresh) =>
			readCodexChatGptToken({
				env: await getProcessEnvWithShellPath(),
				refresh,
			}),
	});

	const inFlight = new Map<string, AbortController>();

	const transcribe = async (
		wav: Uint8Array<ArrayBuffer>,
		signal: AbortSignal,
	): Promise<DesktopTranscriptionResult> => {
		const viaCodex = await codex.transcribe(wav, signal);
		if (viaCodex?.ok) return { ...viaCodex, engine: "chatgpt" };
		if (signal.aborted)
			return { ok: false, error: "aborted", message: "Transcription stopped" };
		const chatgptError =
			viaCodex && !viaCodex.ok ? viaCodex.message : undefined;
		if (chatgptError)
			console.warn("[dictation] ChatGPT transcription failed", chatgptError);
		const binary = transcriberBinary();
		if (!binary) {
			return {
				...(viaCodex ?? {
					ok: false,
					error: "unavailable",
					message: "No desktop transcriber is available",
				}),
				chatgptError,
			};
		}
		const viaMac = await transcribeNatively({ binary, wav, signal });
		return { ...viaMac, engine: "mac", chatgptError };
	};

	return router({
		available: publicProcedure.query(
			async () => transcriberBinary() !== null || (await codex.signedIn()),
		),

		// A ChatGPT sign-in in Codex first, then the Mac's own transcriber. A
		// failure here sends the renderer to the API.
		transcribe: publicProcedure
			.input(
				z.object({
					wav: z.string().min(1).max(MAX_WAV_BASE64_LENGTH),
					id: z.string().max(64).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const controller = new AbortController();
				if (input.id) inFlight.set(input.id, controller);
				try {
					return await transcribe(
						new Uint8Array(Buffer.from(input.wav, "base64")),
						AbortSignal.any([
							controller.signal,
							AbortSignal.timeout(DESKTOP_DEADLINE_MS),
						]),
					);
				} finally {
					if (input.id) inFlight.delete(input.id);
				}
			}),

		cancel: publicProcedure
			.input(z.object({ id: z.string().max(64) }))
			.mutation(({ input }) => {
				inFlight.get(input.id)?.abort();
			}),
	});
};
