import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { StepError } from "renderer/routes/_authenticated/components/GitHubCliDialog/components/StepError";
import { useStallTimeout } from "renderer/routes/_authenticated/hooks/useStallTimeout";
import { CODING_AGENT_LOGIN_ARGS, type CodingAgentId } from "../../constants";

const SIGN_IN_PAGE_STALL_TIMEOUT_MS = 30_000;

type SignInState =
	| { stage: "starting" }
	| { stage: "waiting"; url: string }
	| { stage: "failed" };

interface AgentSignInWaitingProps {
	agent: CodingAgentId;
	/** The agent binary, for the terminal fallback. */
	binaryPath: string | null;
	onSignedIn: () => void;
	onRetry: () => void;
	onCancel: () => void;
}

function shellQuote(value: string): string {
	return /^[\w./-]+$/.test(value)
		? value
		: `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function AgentSignInWaiting({
	agent,
	binaryPath,
	onSignedIn,
	onRetry,
	onCancel,
}: AgentSignInWaitingProps) {
	const { t } = useLingui();
	const [state, setState] = useState<SignInState>({ stage: "starting" });
	const [code, setCode] = useState("");
	const [copied, setCopied] = useState(false);
	const submitCode = electronTrpc.codingAgents.submitSignInCode.useMutation();

	useStallTimeout({
		active: state.stage === "starting",
		resetKey: state.stage,
		timeoutMs: SIGN_IN_PAGE_STALL_TIMEOUT_MS,
		onTimeout: () => setState({ stage: "failed" }),
	});

	electronTrpc.codingAgents.signIn.useSubscription(
		{ agent },
		{
			onData: (event) => {
				if (event.type === "url")
					setState({ stage: "waiting", url: event.url });
				else if (event.type === "done") onSignedIn();
				else setState({ stage: "failed" });
			},
			onError: () => setState({ stage: "failed" }),
		},
	);

	const openPage = (url: string) =>
		window.open(url, "_blank", "noopener,noreferrer");

	if (state.stage === "failed") {
		const command = binaryPath
			? `${shellQuote(binaryPath)} ${CODING_AGENT_LOGIN_ARGS[agent]}`
			: null;
		return (
			<div className="flex flex-col gap-2">
				<StepError message={t`Sign-in didn't finish.`} onRetry={onRetry} />
				{command && (
					<div className="flex flex-col gap-1.5">
						<p className="text-xs text-muted-foreground">
							<Trans>Or sign in from a terminal:</Trans>
						</p>
						<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
							<code className="min-w-0 flex-1 select-text truncate font-mono text-xs">
								{command}
							</code>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="size-6 shrink-0"
								aria-label={t`Copy command`}
								onClick={() =>
									navigator.clipboard.writeText(command).then(
										() => setCopied(true),
										() => setCopied(false),
									)
								}
							>
								{copied ? (
									<LuCheck className="size-3.5" />
								) : (
									<LuCopy className="size-3.5" />
								)}
							</Button>
						</div>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5 text-sm text-muted-foreground">
				<Spinner className="size-3.5 shrink-0" />
				{state.stage === "starting" ? (
					<Trans>Opening the sign-in page…</Trans>
				) : (
					<Trans>
						Finish signing in in your browser. This updates on its own.
					</Trans>
				)}
			</div>
			{state.stage === "waiting" && agent === "claude" && (
				<form
					className="flex items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (!code.trim()) return;
						submitCode.mutate({ agent, code: code.trim() });
						setCode("");
					}}
				>
					<Input
						value={code}
						onChange={(event) => setCode(event.target.value)}
						placeholder={t`Did the page show a code? Paste it here`}
						className="h-8 text-xs"
						aria-label={t`Sign-in code`}
					/>
					<Button
						type="submit"
						size="sm"
						variant="outline"
						disabled={!code.trim()}
					>
						<Trans>Submit</Trans>
					</Button>
				</form>
			)}
			<div className="flex items-center justify-end gap-2">
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					<Trans>Cancel</Trans>
				</Button>
				{state.stage === "waiting" && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => openPage(state.url)}
					>
						<Trans>Open the page again</Trans>
						<LuArrowUpRight className="size-3" />
					</Button>
				)}
			</div>
		</div>
	);
}
