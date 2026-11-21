# Docs site

Everything under `content/` is published at docs.paradev.com, so it documents
only what a customer can run today.

- **CLI reference (`content/docs/cli/cli-reference.mdx`) lists public commands
  only.** A command or group with `audience: "internal"` in its `command.ts` or
  `meta.ts` under `packages/cli/src/commands/` does not appear here, however
  useful it is to us; the desktop's help and `superset --help` are where an
  internal command is discovered. Check the audience before adding an entry,
  and remove the entry in the same change that makes a command internal.
- Features behind a flag or an allowlist (the `environments` CLI group, for
  example) stay out until they ship to everyone. Cloud workspaces are the
  exception: `cloud-workspaces.mdx` documents them with an early-access callout.
  Remove the callout when the `cloud-workspaces` flag reaches everyone.
- **A page written ahead of a launch goes in `drafts/`**, at the same path as
  the page it replaces. Nothing in `drafts/` is built or served; its images
  can already live in `public/images`. Launching it is moving the file into
  `content/docs`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
