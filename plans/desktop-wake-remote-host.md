# Wake a remote host from a desktop workspace

When I submit a prompt or click an existing workspace on my sleeping host, I want Paradev to bring the host online and continue where I left off. Today I leave the desktop, run `superset hosts wake`, and wait before trying again. The CLI already lets the host owner configure the command. [Feature request #10184](https://github.com/ParadevAI/Paradev/issues/10184) · [CLI implementation #5557](https://github.com/ParadevAI/Paradev/pull/5557)

## Proposed interaction

1. I submit a draft for a remote host or explicitly open one of its workspaces. If the host is online, Paradev continues immediately. If it is offline and has a wake command, Paradev shows the host name, the exact command, and that it will run on this computer.
2. I approve. Paradev runs the command once and shows connection progress. A successful command can return while the machine is still booting. Paradev waits for the host to answer through its relay before continuing.
3. My original prompt is submitted once, or my existing workspace opens with its original ID. If I cancel, the command fails, or the host takes too long, I can retry with the same draft.

Opening the app, restoring a window, and browsing the host picker should leave hosts asleep. If choosing an offline host is necessary to load its agent choices, the picker can offer an explicit wake action.

## Command approval

The renderer requests a wake by host ID. The desktop main process resolves the command for that window’s signed-in account and organization, shows it for approval, and executes the exact string reviewed. The command belongs to a shared host and runs with the local user's permissions.

For the first version, we propose asking on every wake. If the desktop remembers approval, bind it to this computer, account, organization, host, and exact command. A change to any of those requires fresh approval.

## Acceptance checks

| Action | Expected result |
| --- | --- |
| Submit a prompt on a sleeping, configured host | One command, one workspace, one prompt |
| Open an existing workspace on that host | Reconnect to the same workspace |
| Open two workspaces on the same sleeping host | Share the pending wake and continue each open once |
| Switch accounts, hosts, or workspaces during the wait | Discard the previous pending action |
| Restore a window or browse hosts | No command runs |
| Cancel approval, fail the command, or time out waiting for the relay | Keep the draft and offer retry |
| Open an offline host without a command | Show the existing offline state |
