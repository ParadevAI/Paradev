import Image from "next/image";
import { CLIENT_LOGOS } from "@/lib/client-logos";

const LOGO_SCALE = 0.8;

const MARQUEE_CSS = `
@keyframes logo-marquee {
	to { transform: translateX(calc(-50% - 1.5rem)); }
}
.logo-marquee-track { animation: logo-marquee 40s linear infinite; }
.logo-marquee:hover .logo-marquee-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
	.logo-marquee-track { animation: none; flex-wrap: wrap; width: auto; justify-content: center; }
}
`;

export function LogoMarquee() {
	return (
		<div className="logo-marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
			<style>{MARQUEE_CSS}</style>
			<ul className="logo-marquee-track flex w-max items-center gap-12">
				{[...CLIENT_LOGOS, ...CLIENT_LOGOS].map((client, index) => (
					<li
						key={`${client.name}-${index}`}
						aria-hidden={index >= CLIENT_LOGOS.length}
						className="flex h-14 shrink-0 items-center"
					>
						<Image
							src={client.logo}
							alt={index >= CLIENT_LOGOS.length ? "" : client.label}
							width={200}
							height={client.height}
							className={`object-contain opacity-80 ${client.invert === false ? "" : "grayscale brightness-0 invert"}`}
							style={{
								height: client.height * LOGO_SCALE,
								width: "auto",
								borderRadius: client.borderRadius ?? 0,
								marginTop: (client.marginTop ?? 0) * LOGO_SCALE,
							}}
							unoptimized
						/>
					</li>
				))}
			</ul>
		</div>
	);
}
