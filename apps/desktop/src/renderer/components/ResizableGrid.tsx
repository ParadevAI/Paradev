import { useCallback, useEffect, useRef, useState } from "react";

interface ResizableGridProps {
	rows: number;
	cols: number;
	children: React.ReactNode;
	className?: string;
	onResize?: () => void;
}

interface DragState {
	type: "row" | "col";
	index: number;
	startPos: number;
	startSize: number;
}

export default function ResizableGrid({
	rows,
	cols,
	children,
	className = "",
	onResize,
}: ResizableGridProps) {
	// Track custom sizes for rows and columns
	// Initialize with equal fractions
	const [rowSizes, setRowSizes] = useState<number[]>(
		() => Array(rows).fill(1 / rows),
	);
	const [colSizes, setColSizes] = useState<number[]>(
		() => Array(cols).fill(1 / cols),
	);

	const containerRef = useRef<HTMLDivElement>(null);
	const [dragState, setDragState] = useState<DragState | null>(null);

	// Reset sizes when grid dimensions change
	useEffect(() => {
		setRowSizes(Array(rows).fill(1 / rows));
	}, [rows]);

	useEffect(() => {
		setColSizes(Array(cols).fill(1 / cols));
	}, [cols]);

	const handleMouseDown = useCallback(
		(
			e: React.MouseEvent<HTMLDivElement>,
			type: "row" | "col",
			index: number,
		) => {
			e.preventDefault();
			const startPos = type === "row" ? e.clientY : e.clientX;
			const startSize =
				type === "row" ? rowSizes[index] : colSizes[index];

			setDragState({ type, index, startPos, startSize });
		},
		[rowSizes, colSizes],
	);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!dragState || !containerRef.current) return;

			const container = containerRef.current;
			const containerRect = container.getBoundingClientRect();

			const currentPos =
				dragState.type === "row" ? e.clientY : e.clientX;
			const delta = currentPos - dragState.startPos;

			// Calculate delta as fraction of container size
			const containerSize =
				dragState.type === "row"
					? containerRect.height
					: containerRect.width;
			const deltaFraction = delta / containerSize;

			if (dragState.type === "row") {
				const newSizes = [...rowSizes];
				const nextIndex = dragState.index + 1;

				// Prevent sizes from becoming negative or too small
				const MIN_SIZE = 0.05; // 5% minimum
				const newCurrentSize = Math.max(
					MIN_SIZE,
					dragState.startSize + deltaFraction,
				);
				const sizeDiff = newCurrentSize - newSizes[dragState.index];

				// Check if next row would become too small
				if (nextIndex < newSizes.length) {
					const newNextSize = newSizes[nextIndex] - sizeDiff;
					if (newNextSize >= MIN_SIZE) {
						newSizes[dragState.index] = newCurrentSize;
						newSizes[nextIndex] = newNextSize;
						setRowSizes(newSizes);
					}
				}
			} else {
				const newSizes = [...colSizes];
				const nextIndex = dragState.index + 1;

				const MIN_SIZE = 0.05;
				const newCurrentSize = Math.max(
					MIN_SIZE,
					dragState.startSize + deltaFraction,
				);
				const sizeDiff = newCurrentSize - newSizes[dragState.index];

				if (nextIndex < newSizes.length) {
					const newNextSize = newSizes[nextIndex] - sizeDiff;
					if (newNextSize >= MIN_SIZE) {
						newSizes[dragState.index] = newCurrentSize;
						newSizes[nextIndex] = newNextSize;
						setColSizes(newSizes);
					}
				}
			}
		},
		[dragState, rowSizes, colSizes],
	);

	const handleMouseUp = useCallback(() => {
		setDragState(null);
		// Trigger resize callback after drag ends
		if (onResize) {
			onResize();
		}
	}, [onResize]);

	// Add/remove global mouse event listeners
	useEffect(() => {
		if (dragState) {
			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
			return () => {
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};
		}
	}, [dragState, handleMouseMove, handleMouseUp]);

	// Convert fractions to CSS grid template strings
	const gridTemplateRows = rowSizes
		.map((size) => `${(size * 100).toFixed(2)}%`)
		.join(" ");
	const gridTemplateColumns = colSizes
		.map((size) => `${(size * 100).toFixed(2)}%`)
		.join(" ");

	return (
		<div
			ref={containerRef}
			className={`relative ${className}`}
			style={{
				display: "grid",
				gridTemplateRows,
				gridTemplateColumns,
				gap: "4px",
			}}
		>
			{children}

			{/* Row resize handles */}
			{Array.from({ length: rows - 1 }).map((_, index) => {
				// Calculate the position based on accumulated sizes
				const position = rowSizes
					.slice(0, index + 1)
					.reduce((sum, size) => sum + size, 0);

				const isActive = dragState?.type === "row" && dragState?.index === index;

				return (
					<div
						key={`row-handle-${index}`}
						className="absolute left-0 right-0 z-10 cursor-row-resize group"
						style={{
							top: `calc(${(position * 100).toFixed(2)}% - 2px)`,
							height: "4px",
						}}
						onMouseDown={(e) => handleMouseDown(e, "row", index)}
					>
						<div
							className={`w-full h-full transition-colors ${
								isActive
									? "bg-blue-500"
									: "group-hover:bg-blue-500/50"
							}`}
						/>
					</div>
				);
			})}

			{/* Column resize handles */}
			{Array.from({ length: cols - 1 }).map((_, index) => {
				const position = colSizes
					.slice(0, index + 1)
					.reduce((sum, size) => sum + size, 0);

				const isActive = dragState?.type === "col" && dragState?.index === index;

				return (
					<div
						key={`col-handle-${index}`}
						className="absolute top-0 bottom-0 z-10 cursor-col-resize group"
						style={{
							left: `calc(${(position * 100).toFixed(2)}% - 2px)`,
							width: "4px",
						}}
						onMouseDown={(e) => handleMouseDown(e, "col", index)}
					>
						<div
							className={`w-full h-full transition-colors ${
								isActive
									? "bg-blue-500"
									: "group-hover:bg-blue-500/50"
							}`}
						/>
					</div>
				);
			})}
		</div>
	);
}
