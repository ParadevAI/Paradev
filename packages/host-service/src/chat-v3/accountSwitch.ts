import type {
	ChatAccountSelection,
	ChatLaunchContext,
} from "@superset/chat/protocol";
import type { HostDb } from "../db";
import { claimNativeSession } from "../terminal-agents/native-session-lease";
import {
	assertAccountResumeHistoryCurrent,
	inspectAccountResumeHistory,
} from "../trpc/router/terminal-agents/account-resume-history";
import { assertNoRecordedClaudeWriter } from "../trpc/router/terminal-agents/account-resume-processes";
import {
	prepareChatAccount,
	sessionAccountForChat,
	validateChatAccount,
} from "./accountLaunch";

interface SwitchInput {
	harness: string;
	account: ChatAccountSelection;
	cwd: string;
	scopeId: string;
	harnessSessionId: string;
	source: ChatLaunchContext;
}

/** Verify access before closing; inspect the final native history after normal exit. */
export async function prepareChatAccountSwitch(
	db: HostDb,
	input: SwitchInput,
	deps = {
		prepare: prepareChatAccount,
		validate: validateChatAccount,
		inspect: inspectAccountResumeHistory,
		assertCurrent: assertAccountResumeHistoryCurrent,
		writers: assertNoRecordedClaudeWriter,
		claim: claimNativeSession,
	},
) {
	const release = deps.claim(
		input.source.account.agent,
		input.harnessSessionId,
	);
	try {
		await deps.validate(db, input.source, input.harness, input.scopeId);
		const target = await deps.prepare(input);
		if (target.agent !== input.source.account.agent)
			throw new Error("The selected account belongs to another provider.");
		const historyInput = {
			source: sessionAccountForChat(input.source.account),
			target: sessionAccountForChat(target),
			sessionId: input.harnessSessionId,
			cwd: input.cwd,
		};
		// This refuses independent histories before the source agent is touched.
		const original = await deps.inspect(historyInput);
		deps.assertCurrent(original);
		return {
			release,
			finish: async () => {
				await deps.validate(db, input.source, input.harness, input.scopeId);
				const current = await deps.prepare(input);
				if (JSON.stringify(current) !== JSON.stringify(target))
					throw new Error(
						"The selected account changed. The saved conversation is intact.",
					);
				const final = await deps.inspect({
					...historyInput,
					previous: original,
				});
				if (
					final.path !== original.path ||
					final.device !== original.device ||
					final.inode !== original.inode ||
					final.size < original.size ||
					(final.size === original.size && final.sha256 !== original.sha256)
				)
					throw new Error(
						"The shared conversation history moved. Nothing else was started.",
					);
				if (target.agent === "claude")
					await deps.writers({
						sessionId: input.harnessSessionId,
						directories: [input.source.account.directory, target.directory],
					});
				// The provider launcher revalidates this identity again before spawning.
				const verified = await deps.prepare(input);
				if (JSON.stringify(verified) !== JSON.stringify(target))
					throw new Error(
						"The selected account changed. The saved conversation is intact.",
					);
				deps.assertCurrent(final);
				return {
					account: target,
					assertCurrent: () => deps.assertCurrent(final),
				};
			},
		};
	} catch (error) {
		release();
		throw error;
	}
}
