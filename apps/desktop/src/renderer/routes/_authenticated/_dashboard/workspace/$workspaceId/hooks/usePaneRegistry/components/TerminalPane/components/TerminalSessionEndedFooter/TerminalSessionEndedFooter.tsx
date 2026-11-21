import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef, useState } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";

interface TerminalSessionEndedFooterProps {
	terminalId: string;
	terminalInstanceId: string;
	onNewShell: () => Promise<void>;
	onClose: () => void;
}

export function TerminalSessionEndedFooter({
	terminalId,
	terminalInstanceId,
	onNewShell,
	onClose,
}: TerminalSessionEndedFooterProps) {
	const { t } = useLingui();
	const [creatingShell, setCreatingShell] = useState(false);
	const newShellRef = useRef<() => void>(() => {});
	newShellRef.current = () => {
		if (creatingShell) return;
		setCreatingShell(true);
		onNewShell()
			.catch((error) => {
				toast.error(t({ message: "Failed to create terminal" }), {
					description: errorMessage(error),
				});
			})
			.finally(() => setCreatingShell(false));
	};

	useEffect(() => {
		const terminal = terminalRuntimeRegistry.getTerminal(
			terminalId,
			terminalInstanceId,
		);
		const subscription = terminal?.onData((data) => {
			if (data === "\r") newShellRef.current();
		});
		return () => subscription?.dispose();
	}, [terminalId, terminalInstanceId]);

	return (
		<div className="flex shrink-0 items-center gap-3 border-t border-border px-2 pt-2 text-xs text-muted-foreground">
			<span className="min-w-0 flex-1 truncate">
				<Trans>Session ended. Press Enter to start a new shell.</Trans>
			</span>
			<Button
				size="xs"
				variant="ghost"
				disabled={creatingShell}
				onClick={() => newShellRef.current()}
			>
				<Trans>New shell</Trans>
			</Button>
			<Button size="xs" variant="ghost" onClick={onClose}>
				<Trans>Close</Trans>
			</Button>
		</div>
	);
}
