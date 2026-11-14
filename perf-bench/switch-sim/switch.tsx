import "../globals.css";
import { I18nProvider } from "@superset/i18n/react";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider/SandboxAccessProvider";
import { TerminalRichInput } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/components/TerminalRichInput";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { startOverlayTracking } from "./compat";

startOverlayTracking();

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
queryClient.setQueryData(["relay-endpoint"], { url: "ws://127.0.0.1:9" });
const workspaceClient = workspaceTrpc.createClient({ links: [httpBatchLink({ url: "http://127.0.0.1:9/trpc" })] });
const cloudClient = cloudTrpc.createClient({ links: [httpBatchLink({ url: "http://127.0.0.1:9/trpc" })] });
const electronClient = electronTrpc.createClient({ links: [httpBatchLink({ url: "http://127.0.0.1:9/trpc" })] });
const localHost = { machineId: "m", activeHostUrl: null, activeOrganizationId: null, activeOrganizationName: null, hostServiceStatus: "unknown", waitForHostReady: async () => null } as never;
const hostWorkspaces = { workspaces: [], isReady: true } as never;
const sandbox = { targets: [], isReady: true, agentCredentialsChangedWorkspaceId: null, usageRefusal: null } as never;

function Panes({ cycle }: { cycle: number }) {
	return (
		<div className="flex flex-col gap-2">
			{[0, 1, 2].map((i) => (
				<div className="flex h-40 flex-col" key={`${cycle}-${i}`}>
					<div className="flex-1 bg-muted" />
					<TerminalRichInput workspaceId="ws" terminalId={`t-${cycle}-${i}`} terminalInstanceId={`i-${i}`} isOpen={false} onClose={() => {}} />
				</div>
			))}
		</div>
	);
}

const host = document.getElementById("root") as HTMLElement;
const root = createRoot(host);
const wrap = (node: React.ReactNode) => (
	<QueryClientProvider client={queryClient}>
		<electronTrpc.Provider client={electronClient} queryClient={queryClient}>
		<cloudTrpc.Provider client={cloudClient} queryClient={queryClient}>
		<workspaceTrpc.Provider client={workspaceClient} queryClient={queryClient}>
			<I18nProvider locale="en">
				<LocalHostServiceContext.Provider value={localHost}>
					<HostWorkspacesContext.Provider value={hostWorkspaces}>
						<SandboxAccessContext.Provider value={sandbox}>{node}</SandboxAccessContext.Provider>
					</HostWorkspacesContext.Provider>
				</LocalHostServiceContext.Provider>
			</I18nProvider>
		</workspaceTrpc.Provider>
		</cloudTrpc.Provider>
		</electronTrpc.Provider>
	</QueryClientProvider>
);
const frames = (n: number) => new Promise<void>((resolve) => { const step = (k: number) => (k <= 0 ? resolve() : requestAnimationFrame(() => step(k - 1))); step(n); });

function buildDom() {
	const area = document.createElement("div");
	area.className = "flex flex-col gap-1 p-2";
	const drag = document.createElement("div");
	drag.className = "drag h-8 w-full bg-background";
	area.append(drag);
	const toggles: HTMLElement[] = [];
	for (let i = 0; i < 400; i++) {
		const row = document.createElement("div");
		row.className = "group relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-accent";
		const icon = document.createElement("span");
		icon.className = "size-4 shrink-0 text-muted-foreground";
		const label = document.createElement("span");
		label.className = "truncate text-foreground";
		label.textContent = `src/module${i}/file${i}.ts`;
		const button = document.createElement("button");
		button.className = "ml-auto flex size-5 items-center justify-center rounded opacity-0 group-hover:opacity-100";
		button.setAttribute("data-state", "closed");
		row.append(icon, label, button);
		area.append(row);
		if (i % 10 === 0) toggles.push(button);
	}
	document.body.append(area);
	return { area, toggles };
}

function OneInput({ open }: { open: boolean }) {
	return (
		<div className="flex h-60 flex-col">
			<div className="flex-1" />
			<TerminalRichInput workspaceId="ws" terminalId="t-check" terminalInstanceId="i-check" isOpen={open} onClose={() => {}} />
		</div>
	);
}

Object.assign(window, {
	__sim: {
		async openCheck() {
			const editor = () => host.querySelector<HTMLElement>('[contenteditable="true"]');
			const result: Record<string, unknown> = {};
			flushSync(() => root.render(wrap(<OneInput open={false} />)));
			await frames(3);
			result.closedHasEditor = editor() !== null;
			flushSync(() => root.render(wrap(<OneInput open />)));
			for (let i = 0; i < 40 && !host.contains(document.activeElement); i++) await frames(1);
			result.openHasEditor = editor() !== null;
			result.openFocused = editor()?.contains(document.activeElement) ?? false;
			document.execCommand("insertText", false, "draft survives");
			await frames(2);
			flushSync(() => root.render(wrap(<OneInput open={false} />)));
			await frames(3);
			flushSync(() => root.render(wrap(<OneInput open />)));
			await frames(5);
			result.draftAfterReopen = editor()?.textContent ?? null;
			const menu = document.createElement("div");
			menu.setAttribute("role", "menu");
			menu.setAttribute("data-state", "open");
			document.body.append(menu);
			await frames(1);
			result.overlayClassWhileOpen = document.body.classList.contains("overlay-open");
			menu.setAttribute("data-state", "closed");
			await frames(1);
			result.overlayClassAfterClose = document.body.classList.contains("overlay-open");
			menu.remove();
			return result;
		},
		async richInput(cycles: number) {
			const times: number[] = [];
			for (let c = 0; c < cycles; c++) {
				flushSync(() => root.render(wrap(null)));
				await frames(2);
				const t0 = performance.now();
				flushSync(() => root.render(wrap(<Panes cycle={c} />)));
				await new Promise((r) => setTimeout(r, 0));
				document.body.offsetHeight;
				await frames(1);
				times.push(performance.now() - t0);
			}
			return times;
		},
		async dataState(rounds: number) {
			const { area, toggles } = buildDom();
			await frames(2);
			const times: number[] = [];
			for (let r = 0; r < rounds; r++) {
				const t0 = performance.now();
				for (const el of toggles) {
					el.setAttribute("data-state", el.getAttribute("data-state") === "closed" ? "delayed-open" : "closed");
					await Promise.resolve();
					document.body.offsetHeight;
				}
				times.push(performance.now() - t0);
			}
			area.remove();
			return times;
		},
	},
});
