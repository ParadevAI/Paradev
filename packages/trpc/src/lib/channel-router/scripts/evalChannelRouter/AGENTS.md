# Channel router evals

These cases score Jev, the model that picks which Devs answer a channel message
nobody @mentioned (`../../channelRouter.ts`). Each case is a channel, its Devs,
the messages before, one message, and the Dev ids that should answer (`[]` for
nobody).

## Where a case goes

- `real-world/` — a case taken from a real channel where the router got it
  wrong, or nearly did. Give it an id that starts with the date
  (`2026-10-30-roster-called-by-name`). Keep the message as it was sent.
  Only use messages from our own organization: never commit a customer's
  messages, even reworded.
- `generated/` — cases an agent or a person wrote to cover a kind of message.
  `eval.ts` is what prompt changes are tuned against; `holdout.ts` is run only
  to check a change, never tuned against, so it stays a fair test.

When a real-world case shows a new kind of mistake, add a few generated cases
of the same kind too, so the fix is not tuned to one message.

## Running

The runner calls Jev for real, so it needs a gateway token. Pull one from the
`api` Vercel project into a scratch directory, not the repo:

```bash
vercel link --yes --project api --scope superset-sh
vercel env pull .env.dev --environment development --yes
```

Then, from `packages/trpc/src/lib/channel-router`:

```bash
bun --env-file=<scratch>/.env.dev scripts/evalChannelRouter/evalChannelRouter.ts
bun --env-file=<scratch>/.env.dev scripts/evalChannelRouter/evalChannelRouter.ts --holdout
```

It prints precision, recall, false positives on nobody cases, and each miss
with its scores, for each set on its own. Scores move a little between runs:
run twice before you trust a change of one case. This is not in CI (it needs
the token and costs model calls), so run it on every prompt or threshold
change and put the numbers in the PR.
