import { Trans } from "@lingui/react/macro";
import { PointerCursor } from "../PointerCursor";

export function DownloadsArt() {
	return (
		<div className="relative size-full bg-[linear-gradient(160deg,#3a3b3f,#1c1d20)]">
			<div className="absolute bottom-0 left-1/2 flex h-[38%] w-[78%] -translate-x-1/2 items-end justify-center gap-[9%] rounded-t-2xl border border-white/15 border-b-0 bg-white/10 px-[6%] pb-[5%] backdrop-blur">
				<span className="mb-[3%] aspect-square w-[22%] rounded-xl bg-white/15" />
				<span className="relative mb-[3%] flex aspect-square w-[22%] items-center justify-center rounded-xl bg-[#f2f2f4] shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
					<svg aria-hidden="true" viewBox="0 0 24 24" className="w-[55%]">
						<rect x="4" y="3" width="16" height="18" rx="2.5" fill="#d9dadf" />
						<path
							d="M12 7v7m0 0-3-3m3 3 3-3M8 17h8"
							stroke="#5d6068"
							strokeWidth="1.6"
							fill="none"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
					<span className="absolute -top-[46%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2b2c30]/95 px-2 py-0.5 font-medium text-[11px] text-white shadow">
						<Trans>Downloads</Trans>
					</span>
					<PointerCursor className="right-[-12%] bottom-[-18%]" />
				</span>
				<span className="mb-[3%] aspect-square w-[22%] rounded-xl bg-white/15" />
			</div>
		</div>
	);
}
