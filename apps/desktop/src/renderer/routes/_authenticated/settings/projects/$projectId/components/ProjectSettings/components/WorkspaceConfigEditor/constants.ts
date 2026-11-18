import { BRAND } from "@superset/shared/brand";

export const CONFIG_TEMPLATE = `# How ${BRAND.NAME} prepares, runs and archives this project's workspaces.
# Docs: https://docs.paradev.com/setup-teardown-scripts

[setup]
run = []

[terminals.dev]
run = []
default = true

[archive]
run = []
`;

export const LOCAL_CONFIG_TEMPLATE = `# Your own tweaks for this repository. Gitignored; applies to every worktree.
# Any key set here replaces the shared one.
`;
