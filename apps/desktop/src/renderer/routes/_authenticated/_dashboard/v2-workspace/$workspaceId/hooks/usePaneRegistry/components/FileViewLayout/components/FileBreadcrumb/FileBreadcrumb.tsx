import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	Fragment,
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { LuChevronRight } from "react-icons/lu";
import { FileIcon } from "renderer/lib/fileIcons";
import { toRelativeWorkspacePath } from "shared/absolute-paths";
import { useSharedFileDocument } from "../../../../../../state/fileDocumentStore";
import { BreadcrumbTree } from "./components/BreadcrumbTree";
import { HiddenTrail } from "./components/HiddenTrail";

const MIN_GAP_TO_ACTIONS = 64;
const CRUMB_GAP = 4;

interface FileBreadcrumbProps {
	workspaceId: string;
	filePath: string;
	onOpenFile: (absolutePath: string) => void;
}

export function FileBreadcrumb({
	workspaceId,
	filePath,
	onOpenFile,
}: FileBreadcrumbProps) {
	const { dirty } = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ staleTime: 30_000 },
	);
	const rootPath = workspaceQuery.data?.worktreePath ?? undefined;
	const relativePath = rootPath
		? toRelativeWorkspacePath(rootPath, filePath)
		: filePath;
	const segments = relativePath.split(/[\\/]/).filter(Boolean);
	const base = rootPath?.replace(/[\\/]+$/, "") ?? "";
	const pathOf = (count: number) =>
		[base, ...segments.slice(0, count)].join("/") || "/";
	const chipRef = useRef<HTMLDivElement>(null);
	const measureRef = useRef<HTMLDivElement>(null);
	const [visibleCount, setVisibleCount] = useState(segments.length);
	const [openCrumb, setOpenCrumb] = useState<number | null>(null);
	const [trailPick, setTrailPick] = useState<number | null>(null);

	useLayoutEffect(() => {
		const chip = chipRef.current;
		const measure = measureRef.current;
		const container = chip?.offsetParent;
		if (!chip || !measure || !(container instanceof HTMLElement)) return;
		const actions = chip
			.closest("[data-file-view]")
			?.querySelector<HTMLElement>("[data-file-view-actions]");
		const fit = () => {
			const [chevron, ellipsis, ...items] = [...measure.children].map(
				(child) => child.getBoundingClientRect().width,
			);
			const style = getComputedStyle(chip);
			const chrome =
				Number.parseFloat(style.paddingLeft) +
				Number.parseFloat(style.paddingRight) +
				Number.parseFloat(style.borderLeftWidth) +
				Number.parseFloat(style.borderRightWidth);
			const right = Math.min(
				container.getBoundingClientRect().right - 8,
				actions
					? actions.getBoundingClientRect().left - MIN_GAP_TO_ACTIONS
					: Number.POSITIVE_INFINITY,
			);
			const available = right - chip.getBoundingClientRect().left;
			const separator = (chevron ?? 0) + CRUMB_GAP * 2;
			for (let count = items.length; count >= 1; count--) {
				const collapsed = count < items.length;
				const width =
					chrome +
					items.slice(-count).reduce((sum, item) => sum + item, 0) +
					(count - 1) * separator +
					(collapsed ? (ellipsis ?? 0) + separator : 0);
				if (width <= available) {
					setVisibleCount(count);
					return;
				}
			}
			setVisibleCount(1);
		};
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(container);
		observer.observe(measure);
		if (actions) observer.observe(actions);
		return () => observer.disconnect();
	}, []);

	const crumbLabel = (index: number, showDot: boolean): ReactNode =>
		index === segments.length - 1 ? (
			<span className="flex items-center gap-1.5 text-foreground">
				<FileIcon
					fileName={segments[index] ?? ""}
					className="size-3.5 shrink-0"
				/>
				{segments[index]}
				{showDot && (
					<span className="size-2 shrink-0 rounded-full bg-muted-foreground" />
				)}
			</span>
		) : (
			segments[index]
		);

	const treeFor = (listIndex: number) => (
		<BreadcrumbTree
			workspaceId={workspaceId}
			directory={pathOf(listIndex)}
			expandedPaths={segments
				.slice(0, -1)
				.map((_, index) => pathOf(index + 1))
				.slice(listIndex)}
			currentFilePath={filePath}
			onOpenFile={(path) => {
				setOpenCrumb(null);
				onOpenFile(path);
			}}
		/>
	);

	const crumb = (key: number, label: ReactNode, content: ReactNode) => (
		<Popover
			open={openCrumb === key}
			onOpenChange={(open) => {
				setOpenCrumb(open ? key : null);
				setTrailPick(null);
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="min-w-0 truncate rounded-sm px-0.5 hover:text-foreground"
				>
					{label}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				{content}
			</PopoverContent>
		</Popover>
	);

	const hidden = Math.max(0, segments.length - visibleCount);
	const separator = (
		<LuChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
	);
	return (
		<>
			<div
				ref={measureRef}
				aria-hidden
				className="pointer-events-none invisible absolute top-0 left-0 flex h-0 w-max overflow-hidden whitespace-nowrap text-xs"
			>
				{separator}
				<span className="px-0.5">…</span>
				{segments.map((segment, index) => (
					<span key={`${index}:${segment}`} className="px-0.5">
						{crumbLabel(index, true)}
					</span>
				))}
			</div>
			<div
				ref={chipRef}
				className="pointer-events-auto absolute top-2 left-2 z-10 flex h-7 max-w-[calc(100%-1rem)] items-center gap-1 overflow-hidden rounded-full border border-border/60 bg-background px-3 text-xs whitespace-nowrap text-muted-foreground shadow-sm"
				title={filePath}
			>
				{hidden > 0 && (
					<>
						{crumb(
							-1,
							"…",
							trailPick === null ? (
								<HiddenTrail
									folders={segments.slice(0, hidden)}
									onPick={setTrailPick}
								/>
							) : (
								treeFor(trailPick)
							),
						)}
						{separator}
					</>
				)}
				{segments.slice(hidden).map((segment, offset) => {
					const index = hidden + offset;
					return (
						<Fragment key={`${index}:${segment}`}>
							{offset > 0 && separator}
							{crumb(index, crumbLabel(index, dirty), treeFor(index))}
						</Fragment>
					);
				})}
			</div>
		</>
	);
}
