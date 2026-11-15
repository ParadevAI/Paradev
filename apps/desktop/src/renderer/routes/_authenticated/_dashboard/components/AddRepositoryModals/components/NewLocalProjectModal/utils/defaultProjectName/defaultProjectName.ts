import { getBaseName } from "renderer/lib/pathBasename";
import type { ProjectSource } from "../buildCreateProjectInput";

const repositoryNameOf = (url: string) =>
	url
		.replace(/\.git$/i, "")
		.split(/[/:\\]/)
		.filter(Boolean)
		.pop() ?? "";

/** The name of the first repository added. */
export function defaultProjectName(first: ProjectSource | undefined): string {
	if (!first) return "";
	return first.kind === "local"
		? getBaseName(first.path)
		: repositoryNameOf(first.url);
}
