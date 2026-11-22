import { COMPANY } from "@superset/shared/constants";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: (
				<div className="flex items-center gap-2">
					<Image src="/logo.png" alt="Paradev" width={24} height={24} />
					<span className="font-semibold">Paradev</span>
				</div>
			),
			url: COMPANY.MARKETING_URL,
		},
	};
}
