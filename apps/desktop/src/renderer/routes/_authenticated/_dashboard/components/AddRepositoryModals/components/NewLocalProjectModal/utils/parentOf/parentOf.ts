export const parentOf = (path: string) =>
	path.replace(/[/\\]+[^/\\]+[/\\]*$/, "");
