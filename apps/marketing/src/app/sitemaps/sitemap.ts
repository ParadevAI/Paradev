import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";
import {
	buildSitemapGroups,
	isSitemapGroup,
	SITEMAP_GROUPS,
} from "./sitemap-groups";

export async function generateSitemaps() {
	return SITEMAP_GROUPS.map((id) => ({ id }));
}

export default async function sitemap({
	id,
}: {
	id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
	const group = await id;
	if (!isSitemapGroup(group)) notFound();
	return (await buildSitemapGroups())[group];
}
