import { useLingui } from "@lingui/react/macro";
import Image from "next/image";
import { TRIGGER_SOURCES } from "./constants";

export function TriggerSources() {
	const { t } = useLingui();

	return (
		<ul className="mt-6 flex flex-wrap gap-2">
			{TRIGGER_SOURCES.map(({ id, name, icon }) => (
				<li
					key={id}
					className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground text-sm"
				>
					{"image" in icon ? (
						<Image src={icon.image} alt="" width={14} height={14} />
					) : (
						<icon.glyph
							aria-hidden="true"
							style={{ width: 14, height: 14, color: icon.color }}
						/>
					)}
					{typeof name === "string" ? name : t(name)}
				</li>
			))}
		</ul>
	);
}
