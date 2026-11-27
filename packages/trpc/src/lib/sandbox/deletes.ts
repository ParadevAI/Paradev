/** Previews and local dev use production's Vercel project with rows copied from its database: only production deletes. */
export function sandboxDeletesAllowed(
	what: string,
	vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
	if (vercelEnv === "production") return true;
	console.log(
		`[sandbox] would delete ${what}; VERCEL_ENV is ${vercelEnv ?? "unset"}, not production`,
	);
	return false;
}
