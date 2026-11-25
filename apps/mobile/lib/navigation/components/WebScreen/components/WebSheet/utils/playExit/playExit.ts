import { BACKDROP_FRAMES, type SheetMotion } from "../../constants";

/** Plays a closed sheet's exit on an inert copy, because its route has already left the page. */
export function playExit(sheet: HTMLElement, motion: SheetMotion) {
	const rect = sheet.getBoundingClientRect();
	const ghost = sheet.cloneNode(true) as HTMLElement;
	const fields = sheet.querySelectorAll("input, textarea");
	ghost.querySelectorAll("input, textarea").forEach((field, index) => {
		(field as HTMLInputElement).value =
			(fields[index] as HTMLInputElement | undefined)?.value ?? "";
	});
	const card = ghost.querySelector<HTMLElement>("[data-web-sheet]");
	card?.removeAttribute("role");
	card?.removeAttribute("aria-modal");
	card?.removeAttribute("data-web-sheet");
	ghost.inert = true;
	ghost.setAttribute("aria-hidden", "true");
	Object.assign(ghost.style, {
		position: "fixed",
		left: `${rect.left}px`,
		top: `${rect.top}px`,
		width: `${rect.width}px`,
		height: `${rect.height}px`,
		pointerEvents: "none",
		zIndex: "2147483000",
	});
	document.body.append(ghost);

	const timing = { ...motion.close, fill: "forwards" } as const;
	const backdrop = ghost.querySelector<HTMLElement>(
		"[data-web-sheet-backdrop]",
	);
	const finished = Promise.all([
		backdrop?.animate(BACKDROP_FRAMES.toReversed(), timing).finished,
		card?.animate(motion.frames.toReversed(), timing).finished,
	]);
	const timeout = new Promise((resolve) =>
		setTimeout(resolve, Number(motion.close.duration) + 100),
	);
	Promise.race([finished, timeout])
		.catch(() => undefined)
		.then(() => ghost.remove());
}
