import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useRef, useState } from "react";

interface FileDropZoneProps {
	onDrop: (files: File[]) => void;
	className?: string;
	children: ReactNode;
}

/** Files dragged over a Gmail composer: "Drop files here" over the box, attached on drop. */
export function FileDropZone({
	onDrop,
	className,
	children,
}: FileDropZoneProps) {
	const [over, setOver] = useState(false);
	const depth = useRef(0);
	const hasFiles = (event: React.DragEvent) =>
		[...event.dataTransfer.types].includes("Files");
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target, reachable by the attach button too
		<div
			className={cn("relative", className)}
			onDragEnter={(event) => {
				if (!hasFiles(event)) return;
				depth.current++;
				setOver(true);
			}}
			onDragOver={(event) => {
				if (hasFiles(event)) event.preventDefault();
			}}
			onDragLeave={() => {
				depth.current = Math.max(0, depth.current - 1);
				if (depth.current === 0) setOver(false);
			}}
			onDrop={(event) => {
				if (!hasFiles(event)) return;
				event.preventDefault();
				depth.current = 0;
				setOver(false);
				const files = [...event.dataTransfer.files];
				if (files.length > 0) onDrop(files);
			}}
		>
			{children}
			{over && (
				<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-blue-500 bg-blue-500/10 text-[15px] font-medium text-blue-600 dark:text-sky-300">
					<Trans>Drop files here</Trans>
				</div>
			)}
		</div>
	);
}
