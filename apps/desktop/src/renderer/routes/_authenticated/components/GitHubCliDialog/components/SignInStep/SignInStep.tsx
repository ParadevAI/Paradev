import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStallTimeout } from "renderer/routes/_authenticated/hooks/useStallTimeout";
import { StepError } from "../StepError";

const CODE_STALL_TIMEOUT_MS = 30_000;

type SignInState =
	| { stage: "starting" }
	| { stage: "code"; code: string; url: string }
	| { stage: "failed" };

interface SignInStepProps {
	onSignedIn: () => void;
	onRetry: () => void;
}

export function SignInStep({ onSignedIn, onRetry }: SignInStepProps) {
	const { t } = useLingui();
	const [state, setState] = useState<SignInState>({ stage: "starting" });
	const [copied, setCopied] = useState(false);

	useStallTimeout({
		active: state.stage === "starting",
		resetKey: state.stage,
		timeoutMs: CODE_STALL_TIMEOUT_MS,
		onTimeout: () => setState({ stage: "failed" }),
	});

	const copy = (code: string) => {
		navigator.clipboard.writeText(code).then(
			() => setCopied(true),
			() => setCopied(false),
		);
	};

	electronTrpc.system.ghAuthLogin.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "code") {
				setState({ stage: "code", code: event.code, url: event.url });
				copy(event.code);
			} else if (event.type === "done") {
				onSignedIn();
			} else {
				setState({ stage: "failed" });
			}
		},
		onError: () => setState({ stage: "failed" }),
	});

	if (state.stage === "failed") {
		return <StepError message={t`Sign-in didn't finish.`} onRetry={onRetry} />;
	}

	if (state.stage === "starting") {
		return (
			<div className="flex items-center gap-2.5 py-2 text-sm text-muted-foreground">
				<Spinner className="size-3.5 shrink-0" />
				<Trans>Getting a sign-in code from GitHub…</Trans>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				<Trans>Open GitHub and enter this code.</Trans>
			</p>
			<div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
				<span className="select-text cursor-text font-mono text-2xl font-semibold tracking-[0.2em] text-foreground">
					{state.code}
				</span>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => copy(state.code)}
				>
					{copied ? (
						<>
							<LuCheck className="size-3.5" />
							<Trans>Copied</Trans>
						</>
					) : (
						<>
							<LuCopy className="size-3.5" />
							<Trans>Copy</Trans>
						</>
					)}
				</Button>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="flex items-center gap-2 text-xs text-muted-foreground">
					<Spinner className="size-3 shrink-0" />
					<Trans>Waiting for GitHub…</Trans>
				</span>
				<Button
					type="button"
					size="sm"
					onClick={() =>
						window.open(state.url, "_blank", "noopener,noreferrer")
					}
				>
					<Trans>Open GitHub</Trans>
					<LuArrowUpRight className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
