import "@xterm/xterm/css/xterm.css";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import {
	attachToContainer,
	createRuntime,
	disposeRuntime,
} from "renderer/lib/terminal/terminal-runtime";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { createCommandSession } from "./utils/createCommandSession";
import { installCommandTerminalLinks } from "./utils/installCommandTerminalLinks";

interface CommandTerminalProps {
	command: string;
	onExit: (exitCode: number | null) => void;
	onOutput?: (data: string) => void;
	/** Receives a writer for sending input to the pty (queued until it exists). */
	onWriterReady?: (write: (data: string) => void) => void;
}

export function CommandTerminal({
	command,
	onExit,
	onOutput,
	onWriterReady,
}: CommandTerminalProps) {
	const appearance = useTerminalAppearance();
	const latest = useRef({
		appearance,
		command,
		onExit,
		onOutput,
		onWriterReady,
	});
	latest.current = { appearance, command, onExit, onOutput, onWriterReady };
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const paneId = `command-terminal-${crypto.randomUUID()}`;
		const runtime = createRuntime(paneId, latest.current.appearance);
		const disposeLinks = installCommandTerminalLinks(
			runtime.terminal,
			(url) => {
				void electronTrpcClient.external.openUrl
					.mutate(url)
					.catch((error: unknown) => {
						toast.error(errorMessage(error));
					});
			},
		);
		const terminal = electronTrpcClient.terminal;
		const session = createCommandSession({
			size: { cols: runtime.terminal.cols, rows: runtime.terminal.rows },
			transport: {
				subscribe: (handlers) => terminal.stream.subscribe(paneId, handlers),
				create: (size) =>
					terminal.createOrAttach.mutate({
						paneId,
						tabId: paneId,
						workspaceId: paneId,
						command: latest.current.command,
						...size,
						skipColdRestore: true,
					}),
				write: (data) => terminal.write.mutate({ paneId, data }),
				resize: (size) => terminal.resize.mutate({ paneId, ...size }),
				kill: () => terminal.kill.mutate({ paneId }),
			},
			onOutput: (data) => {
				runtime.terminal.write(data);
				latest.current.onOutput?.(data);
			},
			onExit: (code) => latest.current.onExit(code),
			onError: (error) => toast.error(errorMessage(error)),
		});
		const input = runtime.terminal.onData(session.write);
		attachToContainer(runtime, container, () =>
			session.resize({
				cols: runtime.terminal.cols,
				rows: runtime.terminal.rows,
			}),
		);
		latest.current.onWriterReady?.(session.write);

		return () => {
			input.dispose();
			disposeLinks();
			session.dispose();
			disposeRuntime(runtime);
		};
	}, []);

	return (
		<div className="relative h-full w-full overflow-hidden">
			<div ref={containerRef} className="h-full w-full" />
		</div>
	);
}
