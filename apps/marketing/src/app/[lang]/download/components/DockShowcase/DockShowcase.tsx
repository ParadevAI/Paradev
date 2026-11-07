"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { EdgeGlare } from "@/app/[lang]/components/EdgeGlare";
import { DockAppIcon } from "./components/DockAppIcon";

const NEIGHBOR_ICONS = [
	"/app-icons/macos/finder.png",
	"/app-icons/macos/notes.png",
	"/app-icons/macos/safari.png",
];
const ICON_STAGGER_S = 0.06;
const MAX_ALIGN_PASSES = 12;
const ICON_CLASS =
	"shrink-0 motion-safe:group-data-[ready=true]:animate-[dock-icon-in_0.55s_cubic-bezier(.16,1,.3,1)_both]";

export function DockShowcase() {
	const mountRef = useRef<HTMLDivElement>(null);
	const shelfRef = useRef<HTMLDivElement>(null);
	const appIconRef = useRef<HTMLSpanElement>(null);

	// Puts the app icon at the stage centre, where the perspective vanishes, so
	// the rest of the dock recedes off to the left. The projection moves the
	// icon, so the offset is corrected from where it actually lands.
	useLayoutEffect(() => {
		const mount = mountRef.current;
		const shelf = shelfRef.current;
		const appIcon = appIconRef.current;
		const stage = mount?.parentElement;
		if (!mount || !shelf || !appIcon || !stage) return;

		const align = () => {
			let anchor =
				shelf.offsetWidth - (appIcon.offsetLeft + appIcon.offsetWidth / 2);
			mount.style.setProperty("--dock-anchor", `${anchor}px`);
			const nudge =
				Number.parseFloat(
					getComputedStyle(mount).getPropertyValue("--dock-nudge"),
				) || 0;
			for (let pass = 0; pass < MAX_ALIGN_PASSES; pass++) {
				const stageRect = stage.getBoundingClientRect();
				const iconRect = appIcon.getBoundingClientRect();
				const delta =
					stageRect.left +
					stageRect.width / 2 +
					nudge -
					(iconRect.left + iconRect.width / 2);
				if (Math.abs(delta) < 0.5) break;
				anchor += delta;
				mount.style.setProperty("--dock-anchor", `${anchor}px`);
			}
		};

		align();
		mount.dataset.ready = "true";
		const observer = new ResizeObserver(align);
		observer.observe(stage);
		return () => observer.disconnect();
	}, []);

	const delayFor = (index: number) => ({
		animationDelay: `${0.12 + index * ICON_STAGGER_S}s`,
	});

	return (
		<div
			aria-hidden="true"
			className="relative h-[16rem] overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_34%)] [perspective:1100px] sm:h-[24rem] lg:h-[32rem]"
		>
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_60%_50%,rgba(255,255,255,0.10),transparent_70%)]" />
			<div
				ref={mountRef}
				className="group absolute top-1/2 left-1/2 w-max opacity-0 [transform-style:preserve-3d] [transform:rotateY(-24deg)_rotateX(7deg)] data-[ready=true]:opacity-100 lg:[--dock-nudge:56px]"
				style={{
					translate:
						"calc(-100% + var(--dock-anchor, 4rem) + var(--dock-nudge, 0px)) -50%",
				}}
			>
				<div
					ref={shelfRef}
					className="relative flex items-center gap-5 rounded-[1.75rem] bg-[linear-gradient(to_right,rgb(255_255_255/0.06),rgb(255_255_255/0.10)_55%,rgb(255_255_255/0.24))] px-6 py-5 backdrop-blur-xl motion-safe:group-data-[ready=true]:animate-[dock-shelf-in_0.8s_cubic-bezier(.16,1,.3,1)_both] md:gap-6 md:px-7 md:py-6"
				>
					{NEIGHBOR_ICONS.map((src, index) => (
						<span key={src} className={ICON_CLASS} style={delayFor(index)}>
							<Image
								src={src}
								alt=""
								width={192}
								height={192}
								className="size-24 sm:size-28 md:size-32"
							/>
						</span>
					))}
					<span
						className={`${ICON_CLASS} mx-1 h-20 w-px self-center bg-white/20 sm:h-22 md:h-24`}
						style={delayFor(NEIGHBOR_ICONS.length)}
					/>
					<span
						ref={appIconRef}
						className={`${ICON_CLASS} relative flex flex-col items-center`}
						style={delayFor(NEIGHBOR_ICONS.length + 1)}
					>
						<DockAppIcon />
						<span className="absolute -bottom-2.5 size-1.5 rounded-full bg-white/85" />
					</span>
					<EdgeGlare radius={420} strength={0.85} baseline={0.07} />
				</div>
			</div>
		</div>
	);
}
