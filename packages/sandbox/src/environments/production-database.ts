/**
 * Points DATABASE_URL at the Neon project's default branch, the production
 * database (NEON_API_KEY, NEON_PROJECT_ID). Returns the branch it chose.
 */
export async function useProductionDatabase(): Promise<string> {
	const key = process.env.NEON_API_KEY;
	const project = process.env.NEON_PROJECT_ID;
	if (!key || !project) {
		throw new Error("--production needs NEON_API_KEY and NEON_PROJECT_ID");
	}
	const headers = { authorization: `Bearer ${key}` };
	const branchesResponse = await fetch(
		`https://console.neon.tech/api/v2/projects/${project}/branches`,
		{ headers },
	);
	if (!branchesResponse.ok) {
		throw new Error(`Neon branches: ${branchesResponse.status}`);
	}
	const branches = (await branchesResponse.json()) as {
		branches: Array<{ id: string; name: string; default?: boolean }>;
	};
	const main = branches.branches.find((b) => b.default);
	if (!main) throw new Error("no default branch in the Neon project");
	const uriResponse = await fetch(
		`https://console.neon.tech/api/v2/projects/${project}/connection_uri?branch_id=${main.id}&database_name=neondb&role_name=neondb_owner&pooled=false`,
		{ headers },
	);
	if (!uriResponse.ok) {
		throw new Error(`Neon connection_uri: ${uriResponse.status}`);
	}
	const uri = (await uriResponse.json()) as { uri?: string };
	if (!uri.uri)
		throw new Error("could not resolve the production connection string");
	process.env.DATABASE_URL = uri.uri;
	process.env.DATABASE_URL_UNPOOLED = uri.uri;
	return `${main.name} (${main.id})`;
}
