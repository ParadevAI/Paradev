import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuTriangleAlert } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CommandTerminal } from "renderer/routes/_authenticated/components/CommandTerminal";
import {
	buildHostsAddCommand,
	isValidSshTarget,
} from "./utils/buildHostsAddCommand";
import { parseOnlineHostId } from "./utils/parseOnlineHostId";

type Phase = "form" | "running" | "success" | "failed";

interface SetUpOverSshDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SetUpOverSshDialog({
	open,
	onOpenChange,
}: SetUpOverSshDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const cloudUtils = cloudTrpc.useUtils();
	const [phase, setPhase] = useState<Phase>("form");
	const [target, setTarget] = useState("");
	const [run, setRun] = useState<{ command: string; attempt: number } | null>(
		null,
	);
	const [hostId, setHostId] = useState<string | null>(null);
	const outputRef = useRef("");
	const terminalBoxRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (open) {
			setPhase("form");
			setRun(null);
		}
	}, [open]);

	const trimmed = target.trim();
	const canStart = isValidSshTarget(trimmed) && organizationId !== null;
	const running = phase === "running";

	const start = () => {
		if (!canStart || running) return;
		outputRef.current = "";
		setHostId(null);
		setRun((prev) => ({
			command: buildHostsAddCommand(trimmed, organizationId),
			attempt: (prev?.attempt ?? 0) + 1,
		}));
		setPhase("running");
	};

	const cancel = () => {
		setRun(null);
		setPhase("form");
	};

	const focusTerminal = () => {
		terminalBoxRef.current
			?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")
			?.focus();
	};

	const handleExit = (exitCode: number | null) => {
		if (exitCode === 0) {
			setHostId(parseOnlineHostId(outputRef.current));
			setPhase("success");
			void cloudUtils.host.roster.invalidate();
		} else {
			setPhase("failed");
		}
	};

	const openHost = async () => {
		await cloudUtils.host.roster.invalidate();
		onOpenChange(false);
		if (hostId) {
			navigate({ to: "/settings/hosts/$hostId", params: { hostId } });
		}
	};

	return (
		<Dialog
			open={open}
			modal
			onOpenChange={(next) => {
				if (!running) onOpenChange(next);
			}}
		>
			<DialogContent
				className="gap-3 sm:max-w-[752px]"
				showCloseButton={!running}
				onEscapeKeyDown={(event) => {
					if (running) event.preventDefault();
				}}
				onInteractOutside={(event) => {
					if (running) event.preventDefault();
				}}
				onFocusOutside={(event) => {
					if (running) event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						<Trans>Set up a host over SSH</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Installs Superset on a machine you can reach with ssh, signs
							Superset in to your account, and keeps it running as a service.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						start();
					}}
				>
					<Input
						autoFocus
						value={target}
						onChange={(event) => setTarget(event.target.value)}
						placeholder={t({
							message:
								"user@host, ssh://user@host:2222, or an ssh config alias",
						})}
						aria-label={t({ message: "SSH destination" })}
						disabled={running || phase === "success"}
						className="font-mono"
					/>
					{running ? (
						<Button
							key="cancel"
							type="button"
							variant="outline"
							onClick={(event) => {
								event.preventDefault();
								cancel();
							}}
						>
							<Trans>Cancel</Trans>
						</Button>
					) : phase === "success" ? (
						<Button key="open-host" type="button" onClick={openHost}>
							<Trans>Open host</Trans>
						</Button>
					) : (
						<Button key="submit" type="submit" disabled={!canStart}>
							{phase === "failed" ? (
								<Trans>Retry</Trans>
							) : (
								<Trans>Set up</Trans>
							)}
						</Button>
					)}
				</form>
				{running && (
					<div className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted/40 px-3.5 text-sm text-muted-foreground">
						<Spinner className="size-3.5 shrink-0" />
						<Trans>
							Answer any questions in the terminal below, such as a password.
						</Trans>
					</div>
				)}
				{phase === "success" && (
					<div className="flex min-h-11 items-center gap-2.5 rounded-md border bg-muted/40 px-3.5 text-sm">
						<LuCheck className="size-3.5 shrink-0 text-emerald-500" />
						<Trans>
							The host is online. Pick it when you create a workspace.
						</Trans>
					</div>
				)}
				{phase === "failed" && (
					<div className="flex min-h-11 items-center gap-2.5 rounded-md border bg-muted/40 px-3.5 text-sm">
						<LuTriangleAlert className="size-3.5 shrink-0 text-destructive" />
						<Trans>Setup stopped. The reason is in the output below.</Trans>
					</div>
				)}
				{phase !== "form" && run && (
					<div
						ref={terminalBoxRef}
						className={cn(
							"h-[340px] w-full overflow-hidden rounded-lg border bg-[#151110] p-3",
							phase === "failed" && "opacity-80",
						)}
					>
						<CommandTerminal
							key={run.attempt}
							command={run.command}
							onExit={handleExit}
							onOutput={(data) => {
								outputRef.current = (outputRef.current + data).slice(-8192);
							}}
							onWriterReady={() => requestAnimationFrame(focusTerminal)}
						/>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
