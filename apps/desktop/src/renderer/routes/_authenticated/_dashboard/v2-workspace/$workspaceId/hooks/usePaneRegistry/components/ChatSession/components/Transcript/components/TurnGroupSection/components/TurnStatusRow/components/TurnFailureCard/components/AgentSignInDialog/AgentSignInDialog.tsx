import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Spinner } from "@superset/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "../../../../../../../../../../components/CopyButton";
import type {
	AgentSignIn,
	DeviceCode,
	SignedInAccount,
} from "../../../../../../../../../../providers/TurnFailureActionsProvider";
import { SignInProgress } from "./components/SignInProgress";
import { CHATGPT_SECURITY_SETTINGS } from "./constants";

type Step =
	| { name: "start" }
	| { name: "paste_code" }
	| { name: "device_code"; code: DeviceCode }
	| { name: "api_key" }
	| { name: "signing_in" }
	| { name: "restarting"; account: SignedInAccount }
	| { name: "restart_failed"; account: SignedInAccount };

const BUSY_STEPS: ReadonlySet<Step["name"]> = new Set([
	"signing_in",
	"restarting",
]);

export function AgentSignInDialog({
	open,
	onOpenChange,
	signIn,
	restartAndContinue,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	signIn: AgentSignIn;
	restartAndContinue: () => Promise<boolean>;
}) {
	const { t } = useLingui();
	const [step, setStep] = useState<Step>({ name: "start" });
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [plan, setPlan] = useState<"personal" | "business">("personal");
	const [opening, setOpening] = useState(false);
	const attempt = useRef(0);
	const pending = useRef<AbortController | null>(null);
	const { label } = signIn;
	const busy = BUSY_STEPS.has(step.name);

	const abandon = () => {
		attempt.current += 1;
		pending.current?.abort();
		pending.current = null;
		setOpening(false);
	};

	useEffect(() => {
		if (!open) {
			attempt.current += 1;
			pending.current?.abort();
			setOpening(false);
			return;
		}
		setStep({ name: "start" });
		setValue("");
		setError(null);
	}, [open]);

	useEffect(() => () => pending.current?.abort(), []);

	const reason = (cause: unknown) =>
		cause instanceof Error
			? cause.message
			: t({ message: "Something went wrong." });

	const go = (next: Step) => {
		setError(null);
		setValue("");
		setStep(next);
	};

	const restart = async (account: SignedInAccount, current: number) => {
		setStep({ name: "restarting", account });
		let restarted = false;
		try {
			restarted = await restartAndContinue();
		} catch {
			restarted = false;
		}
		if (current !== attempt.current) return;
		if (restarted) onOpenChange(false);
		else setStep({ name: "restart_failed", account });
	};

	const save = async (submit: () => Promise<SignedInAccount>, back: Step) => {
		const current = ++attempt.current;
		setError(null);
		setStep({ name: "signing_in" });
		let account: SignedInAccount;
		try {
			account = await submit();
		} catch (cause) {
			if (current !== attempt.current) return;
			setStep(back);
			setError(reason(cause));
			return;
		}
		await restart(account, current);
	};

	const begin = async () => {
		abandon();
		const current = attempt.current;
		setError(null);
		setOpening(true);
		try {
			if (signIn.agent === "claude") {
				const { url } = await signIn.startOauth();
				if (current !== attempt.current) return;
				signIn.openUrl(url);
				setStep({ name: "paste_code" });
				return;
			}
			const code = await signIn.startDeviceCode(plan);
			if (current !== attempt.current) return;
			signIn.openUrl(code.verificationUrl);
			go({ name: "device_code", code });
			const controller = new AbortController();
			pending.current = controller;
			const account = await signIn.waitForDeviceCode(code, controller.signal);
			if (current !== attempt.current) return;
			pending.current = null;
			await restart(account, current);
		} catch (cause) {
			if (current !== attempt.current) return;
			pending.current = null;
			setStep({ name: "start" });
			setError(reason(cause));
		} finally {
			if (current === attempt.current) setOpening(false);
		}
	};

	const back = () => {
		abandon();
		go({ name: "start" });
	};

	const trimmed = value.trim();
	const describedByStep =
		step.name === "start" ||
		step.name === "paste_code" ||
		step.name === "device_code" ||
		step.name === "api_key";

	return (
		<Dialog
			modal
			open={open}
			onOpenChange={(next) => {
				if (!next && busy) return;
				onOpenChange(next);
			}}
		>
			<DialogContent
				className="sm:max-w-md"
				showCloseButton={!busy}
				{...(describedByStep ? {} : { "aria-describedby": undefined })}
			>
				<DialogHeader>
					<DialogTitle>
						<Trans>Sign in to {label}</Trans>
					</DialogTitle>
					{step.name === "start" && (
						<DialogDescription>
							{signIn.agent === "claude" ? (
								<Trans>Use your Claude Pro or Max plan.</Trans>
							) : (
								<Trans>Use your ChatGPT plan.</Trans>
							)}
						</DialogDescription>
					)}
					{step.name === "paste_code" && (
						<DialogDescription>
							<Trans>
								Click Authorize on claude.ai. Anthropic then shows a code. Paste
								it here.
							</Trans>
						</DialogDescription>
					)}
					{step.name === "device_code" && (
						<DialogDescription>
							<Trans>Enter this code on the page we opened:</Trans>
						</DialogDescription>
					)}
					{step.name === "api_key" && (
						<DialogDescription>
							{signIn.agent === "claude" ? (
								<Trans>An Anthropic API key.</Trans>
							) : (
								<Trans>An OpenAI API key.</Trans>
							)}
						</DialogDescription>
					)}
				</DialogHeader>

				{step.name === "start" && (
					<div className="flex flex-col gap-3">
						{signIn.agent === "codex" && (
							<ToggleGroup
								className="w-full"
								onValueChange={(next) => {
									if (next === "personal" || next === "business") setPlan(next);
								}}
								type="single"
								value={plan}
								variant="outline"
							>
								<ToggleGroupItem className="flex-1" value="personal">
									<Trans>Personal</Trans>
								</ToggleGroupItem>
								<ToggleGroupItem className="flex-1" value="business">
									<Trans>Business</Trans>
								</ToggleGroupItem>
							</ToggleGroup>
						)}
						<Button
							className="w-full gap-1.5"
							disabled={opening}
							onClick={() => void begin()}
						>
							{opening ? (
								<Spinner />
							) : signIn.agent === "claude" ? (
								<>
									<Trans>Open claude.ai to sign in</Trans>
									<ArrowUpRight className="size-4" />
								</>
							) : (
								<>
									<Trans>Open ChatGPT to sign in</Trans>
									<ArrowUpRight className="size-4" />
								</>
							)}
						</Button>
						{signIn.agent === "codex" && plan === "personal" && (
							<p className="text-muted-foreground text-xs">
								<Trans>
									First time? Turn on device code sign-in in{" "}
									<button
										className="underline underline-offset-4 hover:text-foreground"
										onClick={() => signIn.openUrl(CHATGPT_SECURITY_SETTINGS)}
										type="button"
									>
										ChatGPT settings
									</button>
									.
								</Trans>
							</p>
						)}
					</div>
				)}

				{step.name === "paste_code" && (
					<form
						className="flex flex-col gap-2"
						id="agent-sign-in-form"
						onSubmit={(event) => {
							event.preventDefault();
							if (signIn.agent !== "claude" || !trimmed) return;
							void save(() => signIn.finishOauth(trimmed), {
								name: "paste_code",
							});
						}}
					>
						<Input
							aria-label={t({ message: "Code" })}
							autoFocus
							className="font-mono"
							onChange={(event) => setValue(event.target.value)}
							placeholder={t({ message: "Paste the code" })}
							value={value}
						/>
						<button
							className="flex items-center gap-1.5 self-start text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground disabled:opacity-50"
							disabled={opening}
							onClick={() => void begin()}
							type="button"
						>
							<Trans>Open claude.ai again</Trans>
							{opening && <Spinner className="size-3" />}
						</button>
					</form>
				)}

				{step.name === "device_code" && (
					<div className="flex flex-col items-center gap-3 py-2 text-center">
						<div className="flex items-center gap-1 rounded-lg border border-dashed px-4 py-2.5">
							<span className="font-mono font-semibold text-xl tracking-[0.2em]">
								{step.code.userCode}
							</span>
							<CopyButton
								label={t({ message: "Copy code" })}
								text={step.code.userCode}
							/>
						</div>
						<p className="flex items-center gap-2 text-muted-foreground text-xs">
							<Spinner className="size-3.5" />
							<Trans>Waiting for approval…</Trans>
						</p>
					</div>
				)}

				{step.name === "api_key" && (
					<form
						className="flex flex-col gap-2"
						id="agent-sign-in-form"
						onSubmit={(event) => {
							event.preventDefault();
							if (!trimmed) return;
							void save(() => signIn.saveApiKey(trimmed), { name: "api_key" });
						}}
					>
						<Input
							aria-label={t({ message: "API key" })}
							autoComplete="off"
							autoFocus
							className="font-mono"
							onChange={(event) => setValue(event.target.value)}
							placeholder={signIn.agent === "claude" ? "sk-ant-…" : "sk-proj-…"}
							type="password"
							value={value}
						/>
						<p className="text-muted-foreground text-xs">
							<Trans>We check it with the provider before we save it.</Trans>
						</p>
					</form>
				)}

				<div aria-live="polite">
					{step.name === "signing_in" && (
						<SignInProgress title={<Trans>Signing in…</Trans>}>
							<Trans>Checking with the provider.</Trans>
						</SignInProgress>
					)}

					{step.name === "restarting" && (
						<SignInProgress title={<Trans>Restarting {label}…</Trans>}>
							<Trans>Your chat history stays. Only the agent restarts.</Trans>
						</SignInProgress>
					)}

					{step.name === "restart_failed" && (
						<div className="flex flex-col gap-1 py-2 text-sm">
							<p className="font-medium">
								<Trans>Signed in, but {label} did not restart.</Trans>
							</p>
							<p className="text-muted-foreground">
								<Trans>
									Try again, or close this and press Continue in the chat.
								</Trans>
							</p>
						</div>
					)}
				</div>

				{error && (
					<p className="text-destructive text-sm" role="alert">
						{error}
					</p>
				)}

				{!busy && (
					<DialogFooter className="items-center sm:justify-between">
						<div className="text-xs">
							{step.name === "start" && (
								<button
									className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
									onClick={() => go({ name: "api_key" })}
									type="button"
								>
									<Trans>Paste an API key instead</Trans>
								</button>
							)}
							{(step.name === "paste_code" ||
								step.name === "api_key" ||
								step.name === "device_code") && (
								<button
									className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
									onClick={back}
									type="button"
								>
									<Trans>Back</Trans>
								</button>
							)}
						</div>
						<div className="flex gap-2">
							{step.name === "paste_code" && (
								<Button
									disabled={!trimmed}
									form="agent-sign-in-form"
									type="submit"
								>
									<Trans>Sign in</Trans>
								</Button>
							)}
							{step.name === "api_key" && (
								<Button
									disabled={!trimmed}
									form="agent-sign-in-form"
									type="submit"
								>
									<Trans>Save and continue</Trans>
								</Button>
							)}
							{step.name === "restart_failed" && (
								<Button
									onClick={() => void restart(step.account, ++attempt.current)}
								>
									<Trans>Try again</Trans>
								</Button>
							)}
							{(step.name === "start" ||
								step.name === "device_code" ||
								step.name === "restart_failed") && (
								<Button onClick={() => onOpenChange(false)} variant="ghost">
									{step.name === "restart_failed" ? (
										<Trans>Close</Trans>
									) : (
										<Trans>Cancel</Trans>
									)}
								</Button>
							)}
						</div>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
