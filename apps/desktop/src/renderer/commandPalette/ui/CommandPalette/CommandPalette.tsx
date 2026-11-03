import { Trans, useLingui } from "@lingui/react/macro";
import { Command, CommandInput } from "@superset/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ArrowLeftIcon } from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useOpenNewWorkspaceInViewedProject } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenNewWorkspaceInViewedProject";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useCommandContext } from "../../core/ContextProvider";
import { executeCommand } from "../../core/execute";
import { useFrameStackStore } from "../../core/frames";
import type { Command as CommandType } from "../../core/types";
import { CommandListView } from "../CommandListView/CommandListView";
import { CommandPaletteFooter } from "../CommandPaletteFooter";
import { SubPaletteView } from "../SubPaletteView/SubPaletteView";
import { WorkspaceSwitcherView } from "../WorkspaceList/WorkspaceSwitcherView";

const QueryContext = createContext<string>("");
export function useCommandPaletteQuery(): string {
	return useContext(QueryContext);
}

export function CommandPalette() {
	const { t, i18n } = useLingui();
	const open = useFrameStackStore((s) => s.open);
	const root = useFrameStackStore((s) => s.root);
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const frames = useFrameStackStore((s) => s.frames);
	const pushFrame = useFrameStackStore((s) => s.pushFrame);
	const popFrame = useFrameStackStore((s) => s.popFrame);
	const reset = useFrameStackStore((s) => s.reset);
	const openNewWorkspace = useOpenNewWorkspaceInViewedProject();

	const context = useCommandContext();
	const [query, setQuery] = useState("");
	const [switcherValue, setSwitcherValue] = useState<string | undefined>();
	const inputRef = useRef<HTMLInputElement>(null);
	const depth = frames.length;
	const currentFrame = frames[depth - 1] ?? null;
	const isSwitcher = root === "switcher" && depth === 0;
	const cycle = useMemo(
		() => ({
			selectedValue: switcherValue,
			onSelectedValueChange: setSwitcherValue,
		}),
		[switcherValue],
	);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			if (!next) {
				setQuery("");
				setSwitcherValue(undefined);
				reset();
			}
		},
		[setOpen, reset],
	);

	const handleSelect = useCallback(
		(command: CommandType) => {
			if (command.children || command.renderFrame) {
				pushFrame(command);
				setQuery("");
				return;
			}
			void executeCommand(command, context);
			handleOpenChange(false);
		},
		[pushFrame, context, handleOpenChange],
	);

	const handleBack = useCallback(() => {
		// The switcher root goes back to the commands root.
		if (depth > 0) popFrame();
		else setOpen(true);
		setQuery("");
		// Going back can unmount the focused element (the back button leaves
		// with the last frame); return focus to the search input so keyboard
		// navigation keeps working.
		inputRef.current?.focus();
	}, [depth, popFrame, setOpen]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			// Only a frame leaves on Backspace; the switcher keeps the back
			// arrow, so clearing a query never bounces you out of it.
			if (event.key === "Backspace" && !query && depth > 0) {
				event.preventDefault();
				handleBack();
			}
		},
		[query, depth, handleBack],
	);

	// cmdk's root Enter handler executes the highlighted list row no matter
	// which element is focused, swallowing Enter aimed at buttons inside the
	// palette (back arrow, expand chevrons). Activate the focused button
	// ourselves; cmdk skips its own handling once the event is
	// defaultPrevented.
	const handleRootKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			const modifier = event.metaKey || event.ctrlKey;
			if (isSwitcher && modifier && !event.shiftKey && !event.altKey) {
				if (event.key === "Backspace") {
					const selection = useFrameStackStore.getState().switcherSelection;
					if (!selection) return;
					event.preventDefault();
					event.stopPropagation();
					handleOpenChange(false);
					useDeleteWorkspaceIntent.getState().request({
						workspaceId: selection.id,
						workspaceName: selection.name,
					});
					return;
				}
				if (event.key.toLowerCase() === "n") {
					event.preventDefault();
					event.stopPropagation();
					handleOpenChange(false);
					openNewWorkspace();
					return;
				}
			}
			if (event.key !== "Enter") return;
			if (!(event.target instanceof HTMLElement)) return;
			const button = event.target.closest("button");
			if (!button) return;
			event.preventDefault();
			button.click();
		},
		[isSwitcher, handleOpenChange, openNewWorkspace],
	);

	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	// Switching roots while open (⌘⇧K over the switcher, or ⌘. over the
	// commands) starts the new root with a clean query and selection.
	const previousRoot = useRef(root);
	useEffect(() => {
		if (previousRoot.current === root) return;
		previousRoot.current = root;
		setQuery("");
		setSwitcherValue(undefined);
	}, [root]);

	const frameTitle = currentFrame ? i18n._(currentFrame.command.title) : null;
	const placeholder = currentFrame?.command.framePlaceholder
		? i18n._(currentFrame.command.framePlaceholder)
		: frameTitle
			? t({
					message: `Search in ${frameTitle}…`,
				})
			: isSwitcher
				? t({ message: "Switch to…" })
				: t({ message: "Search workspaces, commands, files…" });

	// Radix would focus the first tabbable, which is the back arrow once a
	// frame is open; typing is what the palette is for.
	const focusInput = useCallback((event: Event) => {
		event.preventDefault();
		inputRef.current?.focus();
	}, []);

	const backButton = (
		<button
			type="button"
			onClick={handleBack}
			aria-label={t({ message: "Back" })}
			className="text-muted-foreground hover:text-foreground"
		>
			<ArrowLeftIcon className="size-4 shrink-0" />
		</button>
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				showCloseButton={false}
				onOpenAutoFocus={focusInput}
				className="!max-w-[640px] sm:!max-w-[640px] translate-y-0 max-h-[80vh] overflow-hidden rounded-xl p-0"
				style={{ top: "max(16px, calc(50% - 278px))" }}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>
						<Trans>Command Palette</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>Run commands and navigate the application.</Trans>
					</DialogDescription>
				</DialogHeader>
				<Command
					onKeyDown={handleRootKeyDown}
					shouldFilter={false}
					value={isSwitcher ? (switcherValue ?? "") : undefined}
					onValueChange={isSwitcher ? setSwitcherValue : undefined}
					className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-11 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-11 [&_[cmdk-item]]:rounded-md [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-[7px] [&_[cmdk-list]]:max-h-[min(500px,calc(80vh-3rem))]"
				>
					<CommandInput
						ref={inputRef}
						value={query}
						onValueChange={setQuery}
						placeholder={placeholder}
						onKeyDown={handleKeyDown}
						leading={depth > 0 || isSwitcher ? backButton : undefined}
					/>
					<QueryContext.Provider value={query}>
						{currentFrame ? (
							<SubPaletteView
								parent={currentFrame.command}
								query={query}
								onSelect={handleSelect}
							/>
						) : isSwitcher ? (
							<WorkspaceSwitcherView query={query} cycle={cycle} />
						) : (
							<CommandListView query={query} onSelect={handleSelect} />
						)}
					</QueryContext.Provider>
					{!currentFrame && !isSwitcher ? <CommandPaletteFooter /> : null}
				</Command>
			</DialogContent>
		</Dialog>
	);
}
