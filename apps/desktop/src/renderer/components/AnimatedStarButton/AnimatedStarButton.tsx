import { cn } from "@superset/ui/utils";
import {
	AnimatePresence,
	motion,
	useReducedMotion,
	useSpring,
} from "framer-motion";
import { Star } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import type { GithubStarActionState } from "renderer/hooks/useGithubStarAction";

const CONFETTI_COLORS = ["#892ab8", "#ea4c89", "#ffff04", "#4af2fd"];
const PARTICLE_COUNT = 12;

// How long the post-star celebration (icon pop + confetti) stays visible.
// Shared with GitHubStarPill and StarNagCard so they keep rendering the
// button — instead of unmounting it — for exactly as long as this plays.
export const STAR_SUCCESS_ANIMATION_MS = 1700;

interface Particle {
	id: number;
	angle: number;
	distance: number;
	rotate: number;
	color: string;
	size: number;
}

function createBurst(): Particle[] {
	return Array.from({ length: PARTICLE_COUNT }, (_, id) => ({
		id,
		angle: (Math.PI * 2 * id) / PARTICLE_COUNT + Math.random() * 0.6,
		distance: 22 + Math.random() * 20,
		rotate: Math.random() * 540 - 270,
		color: CONFETTI_COLORS[id % CONFETTI_COLORS.length] as string,
		size: 3 + Math.random() * 2,
	}));
}

interface AnimatedStarButtonProps {
	state: GithubStarActionState;
	busy: boolean;
	onActivate: () => void;
	className?: string;
}

/**
 * Shared "Star on GitHub" button for the empty-state pill, sidebar card, and
 * onboarding toast: a tilt-on-hover solid button (auto-inverts light/dark
 * via bg-foreground/text-background) with a label crossfade and a confetti
 * burst on success. Framer Motion only (already a dependency) — no new
 * libraries, no external assets.
 */
export function AnimatedStarButton({
	state,
	busy,
	onActivate,
	className,
}: AnimatedStarButtonProps) {
	const [particles, setParticles] = useState<Particle[]>([]);
	const [justStarred, setJustStarred] = useState(false);
	const [recoiling, setRecoiling] = useState(false);
	const prevStateRef = useRef(state);
	const prefersReducedMotion = useReducedMotion();

	const rotateX = useSpring(0, { stiffness: 300, damping: 20 });
	const rotateY = useSpring(0, { stiffness: 300, damping: 20 });

	function handleMouseMove(e: MouseEvent<HTMLButtonElement>) {
		if (prefersReducedMotion) return;
		const bounds = e.currentTarget.getBoundingClientRect();
		const px =
			(e.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2);
		const py =
			(e.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
		rotateY.set(px * 8);
		rotateX.set(py * -8);
	}

	function handleMouseLeave() {
		rotateX.set(0);
		rotateY.set(0);
	}

	useEffect(() => {
		if (prevStateRef.current !== "starred" && state === "starred") {
			if (prefersReducedMotion) {
				setJustStarred(true);
				const clearTimer = setTimeout(
					() => setJustStarred(false),
					STAR_SUCCESS_ANIMATION_MS,
				);
				return () => clearTimeout(clearTimer);
			}
			setRecoiling(true);
			const recoilTimer = setTimeout(() => {
				setRecoiling(false);
				setJustStarred(true);
				setParticles(createBurst());
			}, 140);
			const clearTimer = setTimeout(() => {
				setJustStarred(false);
				setParticles([]);
			}, STAR_SUCCESS_ANIMATION_MS);
			return () => {
				clearTimeout(recoilTimer);
				clearTimeout(clearTimer);
			};
		}
		prevStateRef.current = state;
	}, [state, prefersReducedMotion]);

	const isStarred = state === "starred";
	const label = isStarred
		? "Starred"
		: busy
			? "Starring…"
			: state === "unknown"
				? "Open GitHub"
				: "Star on GitHub";

	return (
		<motion.button
			type="button"
			onClick={onActivate}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
			disabled={busy || state === "loading"}
			style={{ rotateX, rotateY, transformPerspective: 500 }}
			whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
			whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
			transition={{ type: "spring", stiffness: 220, damping: 26 }}
			className={cn(
				"group relative inline-flex items-center gap-2.5 rounded-xl bg-foreground py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold text-background shadow-md shadow-black/10 transition-[filter,box-shadow] duration-300 ease-out will-change-transform hover:brightness-105 hover:shadow-[0_10px_28px_-8px_rgba(245,197,24,0.55)] disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30 dark:hover:shadow-[0_10px_28px_-8px_rgba(251,191,36,0.35)]",
				className,
			)}
		>
			<motion.span
				animate={
					recoiling ? { x: -2, y: 2, scale: 0.92 } : { x: 0, y: 0, scale: 1 }
				}
				transition={
					recoiling
						? { duration: 0.12 }
						: { type: "spring", stiffness: 300, damping: 12 }
				}
				className="relative flex size-6 shrink-0 items-center justify-center"
			>
				<motion.span
					animate={
						justStarred && !prefersReducedMotion
							? { scale: [1, 1.5, 0.85, 1.1, 1], rotate: [0, -20, 15, -8, 0] }
							: { scale: 1, rotate: 0 }
					}
					transition={{ duration: 0.7, ease: "easeOut" }}
					className="block"
				>
					<Star
						className={cn(
							"size-3.5 text-background transition-colors",
							isStarred
								? "fill-amber-400 text-amber-400"
								: "group-hover:fill-amber-400/80 group-hover:text-amber-400/80",
						)}
					/>
				</motion.span>
				<AnimatePresence>
					{particles.map((p) => (
						<motion.span
							key={p.id}
							initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
							animate={{
								opacity: 0,
								x: [
									0,
									Math.cos(p.angle) * p.distance * 0.6,
									Math.cos(p.angle) * p.distance,
								],
								y: [
									0,
									Math.sin(p.angle) * p.distance * 0.5 - 10,
									Math.sin(p.angle) * p.distance + 8,
								],
								rotate: p.rotate,
								scale: 0.5,
							}}
							exit={{ opacity: 0 }}
							transition={{
								duration: 1.3,
								ease: "easeOut",
								times: [0, 0.4, 1],
							}}
							className="pointer-events-none absolute left-1/2 top-1/2 rounded-sm"
							style={{
								width: p.size,
								height: p.size,
								backgroundColor: p.color,
							}}
						/>
					))}
				</AnimatePresence>
			</motion.span>
			<span className="relative inline-block overflow-hidden">
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={label}
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.15 }}
						className="block"
					>
						{label}
					</motion.span>
				</AnimatePresence>
			</span>
		</motion.button>
	);
}
