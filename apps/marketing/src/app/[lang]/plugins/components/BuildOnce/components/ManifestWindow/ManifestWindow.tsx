import { FileText, Folder } from "lucide-react";
import { MANIFEST_FILES, MANIFEST_JSON } from "../../constants";

export function ManifestWindow() {
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
			<div className="flex h-10 items-center border-border border-b px-4 font-mono text-muted-foreground text-xs">
				plugins/acme-deploy
			</div>
			<div className="grid sm:grid-cols-[13.5rem_minmax(0,1fr)]">
				<ul className="border-border border-b px-3 py-4 font-mono text-[11px] text-muted-foreground sm:border-r sm:border-b-0">
					{MANIFEST_FILES.map((file) => (
						<li
							key={file.path}
							className={`flex items-center gap-1.5 py-1 ${file.path === "plugin.json" ? "text-foreground" : ""}`}
							style={{ paddingLeft: `${file.depth * 0.75}rem` }}
						>
							{file.path.endsWith("/") ? (
								<Folder className="size-3 shrink-0" />
							) : (
								<FileText className="size-3 shrink-0" />
							)}
							<span className="truncate">{file.path}</span>
						</li>
					))}
				</ul>
				<pre className="overflow-x-auto px-4 py-4 font-mono text-[11px] text-foreground leading-5">
					{MANIFEST_JSON}
				</pre>
			</div>
		</div>
	);
}
