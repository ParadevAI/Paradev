# One-off command terminal

Use `CommandTerminal` for a command that needs terminal input/output and ends when
its process exits. Account login, GitHub authentication, and SSH setup share it.

```tsx
<CommandTerminal
  key={attempt}
  command={command}
  onExit={(code) => setSucceeded(code === 0)}
/>
```

One mount owns one process. Change the key to retry or run a different command;
changing callback props does not restart it. Unmounting cancels it, including a
process that finishes starting after the component closes. An exit code of `null`
means startup or transport failed. Cancellation on unmount does not call `onExit`.

`onOutput` observes terminal output. `onWriterReady` supplies an input function
that queues input until creation finishes and becomes a no-op after termination.
Callers own command construction, provider prompts, and account verification.
The terminal does not parse login output or treat a zero exit as account proof.

`createCommandSession` owns subscription, creation, queued input, resize, and
cleanup. Its transport functions are bound to one process; no React, xterm, or
provider logic belongs there. The component connects it to Electron and the
shared terminal runtime, which already handles layout and font changes.

The renderer subscribes before requesting a command. The daemon attaches command
output before spawning. Preserve both boundaries: a prompt can be emitted before
the create request resolves. Do not compensate with sleeps or output replay.
