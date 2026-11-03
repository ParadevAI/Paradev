"use client";

import { useLingui } from "@lingui/react/macro";
import { useReducedMotion } from "framer-motion";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

const POSTER = "/plugins/launch-film-poster.jpg";

export function LaunchFilm() {
	const { t } = useLingui();
	const reducedMotion = useReducedMotion();
	const videoRef = useRef<HTMLVideoElement>(null);
	const [paused, setPaused] = useState(false);
	const [muted, setMuted] = useState(true);

	const toggle = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) {
			void video.play().catch(() => {});
		} else {
			video.pause();
		}
	};

	const toggleSound = () => {
		const video = videoRef.current;
		if (!video) return;
		video.muted = !video.muted;
		setMuted(video.muted);
		if (!video.muted && video.paused) void video.play().catch(() => {});
	};

	return (
		<div className="relative mt-24 aspect-[1600/838] overflow-hidden border border-border bg-[#0a0a0a] sm:mt-32">
			{reducedMotion ? (
				<Image
					src={POSTER}
					alt=""
					fill
					sizes="(min-width: 1152px) 1088px, 100vw"
					className="object-cover"
				/>
			) : (
				<>
					<video
						ref={videoRef}
						src="/plugins/launch-film.mp4"
						poster={POSTER}
						autoPlay
						loop
						muted
						playsInline
						preload="metadata"
						onPlay={() => setPaused(false)}
						onPause={() => setPaused(true)}
						tabIndex={-1}
						aria-hidden="true"
						className="block size-full"
					/>
					<div className="absolute right-3 bottom-3 flex gap-2">
						<button
							type="button"
							onClick={toggleSound}
							aria-label={
								muted ? t({ message: "Unmute" }) : t({ message: "Mute" })
							}
							aria-pressed={!muted}
							className="flex size-8 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
						>
							{muted ? (
								<VolumeX className="size-3.5" />
							) : (
								<Volume2 className="size-3.5" />
							)}
						</button>
						<button
							type="button"
							onClick={toggle}
							aria-label={
								paused
									? t({ message: "Play the animation" })
									: t({ message: "Pause the animation" })
							}
							className="flex size-8 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
						>
							{paused ? (
								<Play className="size-3.5" />
							) : (
								<Pause className="size-3.5" />
							)}
						</button>
					</div>
				</>
			)}
		</div>
	);
}
