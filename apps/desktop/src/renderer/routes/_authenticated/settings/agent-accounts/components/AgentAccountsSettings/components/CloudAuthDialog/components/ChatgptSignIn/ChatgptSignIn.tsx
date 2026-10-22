import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { FOCUS_RING } from "../../constants";
import { CopyStateIcon } from "../CopyStateIcon";

const CHATGPT_SECURITY_SETTINGS = "https://chatgpt.com/settings/security";
const CHATGPT_ADMIN_PERMISSIONS = "https://chatgpt.com/admin/permissions";
const CODE_PLACEHOLDER = "XXXX-XXXXX";
const DEVICE_CODE_LIFETIME_MS = 15 * 60 * 1000;

interface DeviceCode {
	handle: string;
	userCode: string;
	verificationUrl: string;
	intervalSeconds: number;
	expiresAt: number;
}

/**
 * Codex's device-code sign-in: OpenAI shows the person a page to approve
 * this code on, and the API collects the session once they have.
 */
export function ChatgptSignIn({
	plan,
	onConnected,
}: {
	plan: "personal" | "business";
	onConnected: (accountLabel: string | null) => void;
}) {
	const { t } = useLingui();
	const { copyToClipboard, copied } = useCopyToClipboard();
	const [code, setCode] = useState<DeviceCode | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const start = cloudTrpc.agentCredential.startChatgptSignIn.useMutation();
	const poll = cloudTrpc.agentCredential.pollChatgptSignIn.useMutation();
	const startMutate = start.mutateAsync;
	const pollMutate = poll.mutateAsync;
	const onConnectedRef = useRef(onConnected);
	onConnectedRef.current = onConnected;

	const restart = useCallback(async () => {
		setFailure(null);
		setCode(null);
		try {
			const next = await startMutate();
			setCode({ ...next, expiresAt: Date.now() + DEVICE_CODE_LIFETIME_MS });
		} catch (error) {
			setFailure(error instanceof Error ? error.message : String(error));
		}
	}, [startMutate]);

	useEffect(() => {
		void restart();
	}, [restart]);

	useEffect(() => {
		if (!code) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		const check = async () => {
			if (Date.now() > code.expiresAt) {
				setFailure(t({ message: "The code expired. Start again." }));
				return;
			}
			try {
				const result = await pollMutate({ handle: code.handle });
				if (cancelled) return;
				if (result.status === "connected") {
					onConnectedRef.current(result.accountLabel);
					return;
				}
				timer = setTimeout(check, code.intervalSeconds * 1000);
			} catch (error) {
				if (!cancelled) {
					setFailure(error instanceof Error ? error.message : String(error));
				}
			}
		};
		timer = setTimeout(check, code.intervalSeconds * 1000);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [code, pollMutate, t]);

	const stepClass = "flex gap-2";
	const stepNumberClass = "w-4 shrink-0 text-muted-foreground tabular-nums";

	return (
		<div className="space-y-4">
			<ol className="space-y-4">
				<li className={stepClass}>
					<span className={stepNumberClass}>1.</span>
					<div className="space-y-2">
						{plan === "personal" ? (
							<>
								<p>
									<Trans>Turn on device code sign-in for Codex.</Trans>
								</p>
								<ExternalButton href={CHATGPT_SECURITY_SETTINGS}>
									<Trans>Open ChatGPT settings</Trans>
								</ExternalButton>
							</>
						) : (
							<>
								<p>
									<Trans>
										Your workspace admin turns on device code sign-in for Codex.
									</Trans>
								</p>
								<ExternalButton href={CHATGPT_ADMIN_PERMISSIONS}>
									<Trans>Open ChatGPT admin settings</Trans>
								</ExternalButton>
							</>
						)}
					</div>
				</li>
				<li className={stepClass}>
					<span className={stepNumberClass}>2.</span>
					<div className="space-y-2">
						<p>
							<Trans>Open OpenAI's device sign-in page.</Trans>
						</p>
						<ExternalButton
							disabled={!code}
							href={code?.verificationUrl ?? CHATGPT_SECURITY_SETTINGS}
						>
							<Trans>Open device sign-in</Trans>
						</ExternalButton>
					</div>
				</li>
				<li className={stepClass}>
					<span className={stepNumberClass}>3.</span>
					<div className="space-y-2">
						<p>
							<Trans>Enter this code when OpenAI asks for it:</Trans>
						</p>
						<div className="flex items-center gap-2">
							<button
								className={cn(
									"relative flex h-9 items-center rounded-md border border-border bg-background px-3 font-mono text-base tracking-wider hover:bg-accent disabled:hover:bg-background",
									FOCUS_RING,
								)}
								disabled={!code}
								onClick={() => code && void copyToClipboard(code.userCode)}
								type="button"
							>
								<span className={cn(!code && "invisible")}>
									{code?.userCode ?? CODE_PLACEHOLDER}
								</span>
								{code ? null : (
									<Spinner className="absolute inset-0 m-auto size-4" />
								)}
							</button>
							<button
								aria-label={t({ message: "Copy code" })}
								className={cn(
									"flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50",
									FOCUS_RING,
								)}
								disabled={!code}
								onClick={() => code && void copyToClipboard(code.userCode)}
								type="button"
							>
								<CopyStateIcon copied={copied} />
							</button>
						</div>
					</div>
				</li>
			</ol>
			<div className="flex items-center gap-3 text-muted-foreground">
				{failure ? (
					<span className="flex-1 text-destructive">{failure}</span>
				) : (
					<span className="flex flex-1 items-center gap-2">
						<Spinner className="size-3.5" />
						<Trans>Waiting for approval. Keep this dialog open.</Trans>
					</span>
				)}
				<Button
					className="gap-1.5"
					disabled={start.isPending}
					onClick={() => void restart()}
					size="sm"
					variant="ghost"
				>
					<RotateCcw className="size-3.5" />
					<Trans>Restart</Trans>
				</Button>
			</div>
		</div>
	);
}

function ExternalButton({
	href,
	disabled,
	children,
}: {
	href: string;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Button
			asChild
			className={cn("gap-1.5", disabled && "pointer-events-none opacity-50")}
			size="sm"
			variant="outline"
		>
			<a
				aria-disabled={disabled}
				href={href}
				rel="noreferrer"
				tabIndex={disabled ? -1 : undefined}
				target="_blank"
			>
				{children}
				<ArrowUpRight className="size-3.5" />
			</a>
		</Button>
	);
}
