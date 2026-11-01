export interface PartialRoute {
	name: string;
	params?: object;
	key?: string;
}

const baseOf = (parent: string) => parent.replace(/\/?index$/, "");

function parentOf(name: string, parents: readonly string[]) {
	let best: string | undefined;
	for (const parent of parents) {
		if (parent === name || !name.startsWith(`${baseOf(parent)}/`)) continue;
		if (!best || baseOf(parent).length > baseOf(best).length) best = parent;
	}
	return best;
}

function paramsFor(parent: string, params: object | undefined) {
	const names = [...parent.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
	const source = (params ?? {}) as Record<string, unknown>;
	if (names.some((key) => source[key] === undefined)) return null;
	return Object.fromEntries(names.map((key) => [key, source[key]]));
}

/**
 * Puts each route's missing parent screens below it, so back from a deep link goes up instead of to the first screen.
 * A stack that opens on another route gets its `root` screen first.
 */
export function withParentRoutes<Route extends PartialRoute>(
	routes: readonly Route[],
	parents: readonly string[],
	root?: string,
): (Route | PartialRoute)[] {
	const out: (Route | PartialRoute)[] =
		root && routes[0] && routes[0].name !== root ? [{ name: root }] : [];
	for (const route of routes) {
		const missing: PartialRoute[] = [];
		let parent = parentOf(route.name, parents);
		while (parent && out.at(-1)?.name !== parent) {
			const params = paramsFor(parent, route.params);
			if (!params) break;
			missing.unshift({ name: parent, params });
			parent = parentOf(parent, parents);
		}
		if (out.length > 0) out.push(...missing);
		out.push(route);
	}
	return out;
}
