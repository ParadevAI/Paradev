import * as p from "@clack/prompts";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import type { ApiClient } from "../../../../lib/api-client";
import { command } from "../../../../lib/command";
import { canReachDesktop, openUrl } from "../../../../lib/open-url";

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

const DEVICE_CODE_LIFETIME_MS = 15 * 60 * 1000;

/**
 * Codex on a ChatGPT plan: the device-code sign-in, run by the API so the
 * session is Superset's own and never the one on this machine.
 */
async function signInWithChatgpt(api: ApiClient) {
	const code = await api.agentCredential.startChatgptSignIn.mutate();
	p.note(
		[
			"1. Turn on device code sign-in for Codex: https://chatgpt.com/settings/security (on a Business plan, your workspace admin turns it on: https://chatgpt.com/admin/permissions)",
			`2. Open ${code.verificationUrl}`,
			`3. Enter ${code.userCode}`,
		].join("\n"),
		"Sign in to ChatGPT",
	);
	if (process.stdout.isTTY && canReachDesktop()) {
		void openUrl(code.verificationUrl).catch(() => {});
	}
	const spinner = p.spinner();
	spinner.start("Waiting for approval");
	const deadline = Date.now() + DEVICE_CODE_LIFETIME_MS;
	while (Date.now() < deadline) {
		await new Promise((resolve) =>
			setTimeout(resolve, code.intervalSeconds * 1000),
		);
		const result = await api.agentCredential.pollChatgptSignIn
			.mutate({ handle: code.handle })
			.catch((error) => {
				spinner.stop("Sign-in failed");
				throw error;
			});
		if (result.status === "connected") {
			spinner.stop(`Signed in as ${result.accountLabel ?? "ChatGPT"}`);
			return { agent: "codex", kind: "subscription" as const };
		}
	}
	spinner.stop("The code expired");
	throw new CLIError("The code expired before it was approved", "Run it again");
}

export default command({
	sandbox: false,
	description:
		"Store an agent's subscription token or API key for your cloud workspaces; read from stdin or a prompt",
	args: [positional("agent").required().desc("Agent: claude or codex")],
	options: {
		kind: string()
			.enum("subscription", "api_key")
			.required()
			.desc(
				"subscription: the token from `claude setup-token`, or for codex a ChatGPT sign-in; api_key: a provider or gateway key",
			),
		gateway: boolean().desc("The key is a Vercel AI Gateway key"),
		baseUrl: string().desc("A compatible endpoint the key is for"),
	},
	run: async ({ ctx, args, options }) => {
		const agent = args.agent as string;
		if (agent === "codex" && options.kind === "subscription") {
			const saved = await signInWithChatgpt(ctx.api);
			return {
				data: saved,
				message: "Signed codex in for your cloud workspaces (ChatGPT)",
			};
		}
		const hint =
			options.kind === "subscription" && agent === "claude"
				? "Run `claude setup-token` and paste the token it prints"
				: `Paste the ${agent} ${options.kind === "subscription" ? "token" : "API key"}`;
		let value: string | undefined;
		if (!process.stdin.isTTY) {
			value = await readStdin();
		} else {
			const entered = await p.password({ message: hint });
			if (p.isCancel(entered)) throw new CLIError("Cancelled");
			value = entered;
		}
		if (!value?.trim()) {
			throw new CLIError(
				"No value given",
				`${hint}, or pipe it: printf '%s' "$TOKEN" | superset connections agents set ${agent} --kind ${options.kind}`,
			);
		}
		const saved = await ctx.api.agentCredential.set.mutate({
			agent,
			kind: options.kind,
			value,
			baseUrl: options.baseUrl,
			provider: options.gateway ? "gateway" : undefined,
		});
		return {
			data: saved,
			message: `Signed ${saved.agent} in for your cloud workspaces (${saved.kind})`,
		};
	},
});
