import type { EmojiItem } from "@tiptap/extension-emoji";
import type { KeyboardEvent, RefObject } from "react";
import { EmojiGlyph } from "../EmojiGlyph";

export const COLUMNS = 9;

export interface GridSection {
	id: string;
	label: string;
	items: EmojiItem[];
}

interface EmojiGridProps {
	sections: GridSection[];
	tone: number;
	scrollRef: RefObject<HTMLDivElement | null>;
	onScroll: () => void;
	onHover: (item: EmojiItem | null) => void;
	onFocusCell: (item: EmojiItem) => void;
	onPick: (item: EmojiItem) => void;
	onLeaveTop: () => void;
}

/** Each section under its heading, nine to a row; arrows move by row and column across sections. */
export function EmojiGrid({
	sections,
	tone,
	scrollRef,
	onScroll,
	onHover,
	onFocusCell,
	onPick,
	onLeaveTop,
}: EmojiGridProps) {
	const rows: { section: number; start: number; length: number }[] = [];
	let index = 0;
	sections.forEach((section, s) => {
		for (let at = 0; at < section.items.length; at += COLUMNS) {
			rows.push({
				section: s,
				start: index + at,
				length: Math.min(COLUMNS, section.items.length - at),
			});
		}
		index += section.items.length;
	});
	const focusCell = (target: number) =>
		scrollRef.current
			?.querySelector<HTMLButtonElement>(`[data-cell="${target}"]`)
			?.focus();
	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		const cell = Number((event.target as HTMLElement).dataset.cell);
		if (Number.isNaN(cell)) return;
		const row = rows.findIndex(
			(r) => cell >= r.start && cell < r.start + r.length,
		);
		const current = rows[row];
		if (!current) return;
		const column = cell - current.start;
		const toRow = (r: number) => {
			const next = rows[r];
			if (next) focusCell(next.start + Math.min(column, next.length - 1));
		};
		if (event.key === "ArrowRight") focusCell(Math.min(cell + 1, index - 1));
		else if (event.key === "ArrowLeft") focusCell(Math.max(cell - 1, 0));
		else if (event.key === "ArrowDown") toRow(row + 1);
		else if (event.key === "ArrowUp") {
			if (row === 0) onLeaveTop();
			else toRow(row - 1);
		} else return;
		event.preventDefault();
	};
	let offset = 0;
	return (
		<div
			ref={scrollRef}
			onScroll={onScroll}
			className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
		>
			{sections.map((section) => {
				const first = offset;
				offset += section.items.length;
				return (
					<section
						key={section.id}
						data-section={section.id}
						className="[content-visibility:auto] [contain-intrinsic-size:auto_320px]"
					>
						<h3 className="sticky top-0 z-10 bg-popover px-1.5 pt-2 pb-1 text-[13px] font-semibold text-foreground">
							{section.label}
						</h3>
						<div className="grid grid-cols-9">
							{section.items.map((item, i) => (
								<button
									key={`${section.id}-${item.name}`}
									type="button"
									data-cell={first + i}
									tabIndex={first + i === 0 ? 0 : -1}
									aria-label={item.name}
									onMouseEnter={() => onHover(item)}
									onFocus={() => onFocusCell(item)}
									onKeyDown={onKeyDown}
									onClick={() => onPick(item)}
									className="flex h-8 w-[35px] items-center justify-center rounded-md text-[22px] outline-none hover:bg-fill-hover focus-visible:bg-fill-selected"
								>
									<EmojiGlyph item={item} tone={tone} />
								</button>
							))}
						</div>
					</section>
				);
			})}
		</div>
	);
}
