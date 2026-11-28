#!/usr/bin/env bun
import { writeBundledSkills } from "../packages/cli/src/lib/plugins/bundled-skills";
import { findMarketplace } from "../packages/cli/src/lib/plugins/marketplace";

const issues = writeBundledSkills(findMarketplace().root);
if (issues.length) {
	for (const issue of issues)
		console.error(`  ${issue.name}: ${issue.problem}`);
	process.exit(1);
}
