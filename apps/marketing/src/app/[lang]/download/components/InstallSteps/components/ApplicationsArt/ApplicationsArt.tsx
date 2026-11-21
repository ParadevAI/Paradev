import { Trans } from "@lingui/react/macro";
import Image from "next/image";
import { PointerCursor } from "../PointerCursor";

// App names are proper nouns and read the same in every locale
const ROWS = [
	{ name: "Notes", icon: "/app-icons/macos/notes.png" },
	{ name: "Paradev", icon: "/app-icons/paradev.png", selected: true },
	{ name: "Safari", icon: "/app-icons/macos/safari.png" },
];

export function ApplicationsArt() {
	return (
		<div className="relative size-full bg-[#f5f5f7] px-[7%] pt-[6%] text-[#1d1d1f]">
			<p className="mb-[4%] font-semibold text-[13px]">
				<Trans>Applications</Trans>
			</p>
			<ul className="space-y-0.5">
				{ROWS.map((row) => (
					<li
						key={row.name}
						className={`relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] ${row.selected ? "bg-black/[0.08]" : ""}`}
					>
						<Image src={row.icon} alt="" width={22} height={22} />
						{row.name}
						{row.selected ? <PointerCursor className="right-[18%]" /> : null}
					</li>
				))}
			</ul>
		</div>
	);
}
