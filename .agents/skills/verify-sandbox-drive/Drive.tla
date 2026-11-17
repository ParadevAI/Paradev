----------------------------- MODULE Drive -----------------------------
(* One cloud workspace row, its boxes (sandbox ids 1 and 2), their        *)
(* workspace drives (drive i is drive-<box i>), one environment, and every *)
(* step of the drive lifecycle. Each provider call or DB write is its own *)
(* action, so a function can die between any two of them.                *)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  \* Guards the code has at head. TRUE is the code; FALSE is a broken config.
  WaitDetach,          \* wakeSandbox waits for the drive to detach before update + resume
  BootRefusesMissing,  \* layout_drive refuses drive.missing
  SettleNeedsLayout,   \* settleSandbox requires a drive.layout stamp
  ReapChecksEpoch,     \* reapArchivedCloudWorkspace: isStillArchived(archivedAt)
  MarkTearsOnlyArchived, \* provision: a lost transition tears down only for an archived row
  StripIdentity,       \* a golden drive carries no owner sentinel (release, promote)
  WakeClaimFromEnv,    \* broken only: a wake's claim names the environment's drive
  WakeWritesDrive,     \* broken only: a wake writes a drive name to the row
  \* Fixes the code does not have at head. FALSE is the code at head.
  FixRetire,     \* a queued teardown retires the row's names; unarchive then gets new ones
  FixDowngrade,  \* the boot refuses a bundle without drive support when a drive is named
  FixFresh,      \* a golden drive is stripped of local branches, so a branch on a drive is the workspace's
  FixLaid,       \* the row records that the drive was laid out; a wake claims laid-out only then
  FixProvRetry,  \* a provision's drive refusal stops the box and leaves the row live
  FixProvWait,
  FixMarkEpoch,
  FixWakeLock,   \* a wake checks the drive is detached in the same step as the resume  \* a provision that lost its row tears down only for the archive it lost to   \* a provision that finds its box stopped waits for the drive to detach
  HasSweep,      \* a sweep deletes drives no row names
  \* Bounds
  MaxSessions, MaxMountFails, MaxRedeliveries, MaxArchives, MaxEnvChanges,
  MaxBundleChanges, MaxWakes, MaxAborts,
  Wakers         \* two concurrent wake calls, as model values

Boxes == {1, 2}
DriveIds == {1, 2}

VARIABLES
  status,    \* cloud_workspaces.status: provisioning | awake | failed | archived
  rowBox,    \* cloud_workspaces.provider_sandbox_id: 1 or 2
  rowDrive,  \* cloud_workspaces.drive_name: 0 (none), 1 or 2
  rowLaid,   \* FixLaid only: a column saying the drive was laid out
  retired,   \* a teardown was queued for the row's names (ghost at head, read by FixRetire)
  epoch,     \* archive count; deleted_at in the reap job
  prov,      \* the provision job's step: none | claim | fork | create | mark | settle
  provD,     \* the drive name the provision claimed
  provEnv,   \* the environment's golden drive was set when the provision read it
  provBox,   \* the providerSandboxId the provision read
  provEpoch, \* the archive count when the provision read the row
  wk,        \* each concurrent wake: [ph, b]
  boxes,     \* the Vercel sandboxes
  drives,    \* the Vercel drives
  reapQ,     \* QStash reap jobs: [e, stage]
  tdQ,       \* QStash teardown jobs: [b, d, ph]
  envDrive,  \* environments.golden_drive_name is set
  gOwn,      \* the golden drive's owner sentinel: none | other
  gBr,       \* the golden drive's checkout already has this workspace's branch
  bundle,    \* the environment's pinned bundle: aware | old (no drive support)
  hasWork,   \* ghost: the user has work that must not be lost
  workDrive, \* ghost: the drive that holds it, or 0
  workBox,   \* ghost: the box whose root disk holds it, or 0
  doubleMount, badDel, failedTransient,   \* ghosts for the rules
  sessions, mfail, redeliveries, envCh, bundleCh, wakes, aborts   \* bounds

vars == <<status, rowBox, rowDrive, rowLaid, retired, epoch, prov, provD, provEnv, provBox, provEpoch,
          wk, boxes, drives, reapQ, tdQ, envDrive, gOwn, gBr, bundle,
          hasWork, workDrive, workBox, doubleMount, badDel, failedTransient,
          sessions, mfail, redeliveries, envCh, bundleCh, wakes, aborts>>
rowVars == <<status, rowBox, rowDrive, rowLaid, retired, epoch>>
provVars == <<prov, provD, provEnv, provBox, provEpoch>>
envVars == <<envDrive, gOwn, gBr, bundle>>
ghostVars == <<hasWork, workDrive, workBox, doubleMount, badDel, failedTransient>>
budgetVars == <<sessions, mfail, redeliveries, envCh, bundleCh, wakes, aborts>>

NoBox == [ex |-> FALSE, run |-> FALSE, mount |-> 0, next |-> 0, cD |-> 0, cL |-> FALSE,
          boot |-> "none", why |-> "none", bound |-> FALSE, lay |-> FALSE,
          ok |-> FALSE, root |-> "aware", sroot |-> "aware", mk |-> FALSE, smk |-> FALSE,
          rw |-> FALSE]
NoDrive == [ex |-> FALSE, att |-> 0, own |-> "none", con |-> "golden", br |-> FALSE]

Live == status \in {"provisioning", "awake"}
\* The teardown may delete neither a box nor a drive a live row names.
LiveNames(b, d) == Live /\ (rowBox = b \/ (d # 0 /\ rowDrive = d))

Init ==
  /\ status = "provisioning" /\ rowBox = 1 /\ rowDrive = 0 /\ rowLaid = FALSE
  /\ retired = FALSE /\ epoch = 0
  /\ prov = "claim" /\ provD = 0 /\ provEnv = FALSE /\ provBox = 1 /\ provEpoch = 0
  /\ wk = [w \in Wakers |-> [ph |-> "idle", b |-> 1, d |-> 0, cd |-> 0, cl |-> FALSE]]
  /\ boxes = [b \in Boxes |-> NoBox] /\ drives = [d \in DriveIds |-> NoDrive]
  /\ reapQ = {} /\ tdQ = {}
  /\ envDrive \in BOOLEAN /\ gOwn = IF StripIdentity THEN "none" ELSE "other"
  /\ gBr \in BOOLEAN /\ bundle = "aware"
  /\ hasWork = FALSE /\ workDrive = 0 /\ workBox = 0
  /\ doubleMount = FALSE /\ badDel = FALSE /\ failedTransient = FALSE
  /\ sessions = 0 /\ mfail = 0 /\ redeliveries = 0 /\ envCh = 0 /\ bundleCh = 0
  /\ wakes = 0 /\ aborts = 0

\* ---------------------------------------------------------------- boxes
Ended(bx) == [bx EXCEPT !.run = FALSE, !.boot = "none", !.why = "none", !.bound = FALSE,
                        !.lay = FALSE, !.ok = FALSE]
\* A clean end takes the root snapshot. The drive stays attached until Detach.
CleanStop(bx) == [Ended(bx) EXCEPT !.sroot = bx.root, !.smk = bx.mk]
\* An abort rolls the root disk back to the last snapshot; the drive does not roll back.
Aborted(bx) == [Ended(bx) EXCEPT !.root = bx.sroot, !.mk = bx.smk]
StopIn(bs, b) == IF bs[b].ex /\ bs[b].run THEN [bs EXCEPT ![b] = CleanStop(bs[b])] ELSE bs

\* A session starts with the mounts set for it; a mount can transiently fail.
\* Vercel is not trusted to refuse a drive that is still attached: that is doubleMount.
Start(b, base, m, cd, cl) ==
  \E fail \in (IF m # 0 /\ drives[m].ex /\ mfail < MaxMountFails THEN BOOLEAN ELSE {FALSE}) :
    LET mm == IF m # 0 /\ drives[m].ex /\ ~fail THEN m ELSE 0 IN
    /\ boxes' = [boxes EXCEPT ![b] = [base EXCEPT !.ex = TRUE, !.run = TRUE, !.mount = mm,
                   !.cD = cd, !.cL = cl, !.boot = "booting", !.why = "none", !.bound = FALSE,
                   !.lay = FALSE, !.ok = FALSE]]
    /\ drives' = IF mm # 0 THEN [drives EXCEPT ![mm].att = b] ELSE drives
    /\ doubleMount' = (doubleMount \/ (mm # 0 /\ drives[mm].att # 0))
    /\ mfail' = IF fail THEN mfail + 1 ELSE mfail
    /\ sessions' = sessions + 1

\* ------------------------------------------------------- superset-boot
\* layout_drive against drives ds: refuse, bind the drive, or nothing (none mounted, none named).
LayoutOf(bx, ds) ==
  IF bx.mount = 0 THEN (IF bx.cD # 0 /\ BootRefusesMissing THEN "missing" ELSE "none")
  ELSE LET o == ds[bx.mount].own IN
       IF o = "other" THEN "foreign"
       ELSE IF o = "none" /\ bx.cL THEN "unlaid"
       ELSE "bound"
AfterLayout(bx, r) ==
  CASE r = "bound" -> [bx EXCEPT !.bound = TRUE, !.lay = TRUE]
    [] r = "none" -> bx
    [] OTHER -> [bx EXCEPT !.boot = "refused", !.why = r]
\* The owner sentinel is written at the first layout, before anything reads /workspace.
OwnAfter(ds, bx, r) == IF r = "bound" THEN [ds EXCEPT ![bx.mount].own = "self"] ELSE ds

\* The checkout: what it does to the drive's content.
\* golden = the golden's copy, unfetched; fresh = fetched for this workspace;
\* stale = kept unfetched because the branch name was in the golden; work; clobbered.
DriveCheckout(c, br, q, mk) ==
  IF q = "aware"
    THEN IF c = "golden" THEN (IF br THEN "stale" ELSE "fresh") ELSE c
    ELSE IF mk THEN c
         ELSE CASE c = "work" -> "clobbered"          \* fetch + checkout -B, or reclone
                [] c \in {"golden", "stale"} -> "fresh"
                [] OTHER -> c

\* superset-boot, one step: the script on the root disk lays out the drive (if it
\* knows how); apply-rootfs installs the pinned bundle's script, and a changed
\* script re-execs (stamping boot.start again, so only its own layout counts);
\* then the checkout; then host-service answers. Bind mounts survive the re-exec.
Boot(b) ==
  LET bx == boxes[b]
      q == bundle
      r1 == IF bx.root = "aware" THEN LayoutOf(bx, drives) ELSE "none"
      a1 == AfterLayout(bx, r1)
      d1 == OwnAfter(drives, bx, r1)
      reexec == q # bx.root
      b1 == [a1 EXCEPT !.root = q, !.lay = IF reexec THEN FALSE ELSE a1.lay]
      r2 == IF q = "aware" /\ (reexec \/ ~a1.bound) THEN LayoutOf(b1, d1) ELSE "skip"
      b2 == IF r2 = "skip" THEN b1 ELSE AfterLayout(b1, r2)
      d2 == IF r2 = "skip" THEN d1 ELSE OwnAfter(d1, b1, r2)
      dm == b2.mount
  IN
  /\ bx.ex /\ bx.run /\ bx.boot = "booting"
  /\ CASE a1.boot = "refused" ->
          /\ boxes' = [boxes EXCEPT ![b] = a1] /\ drives' = d1
       [] FixDowngrade /\ q = "old" /\ (a1.bound \/ bx.cD # 0) ->
          /\ boxes' = [boxes EXCEPT ![b] = [a1 EXCEPT !.boot = "refused", !.why = "unsupported"]]
          /\ drives' = d1
       [] b2.boot = "refused" ->
          /\ boxes' = [boxes EXCEPT ![b] = b2] /\ drives' = d2
       [] OTHER ->
          /\ boxes' = [boxes EXCEPT ![b] = [b2 EXCEPT !.boot = "up",
                         !.mk = IF b2.bound /\ q = "aware" THEN b2.mk ELSE TRUE]]
          /\ drives' = IF b2.bound
                         THEN [d2 EXCEPT ![dm].con = DriveCheckout(d2[dm].con, d2[dm].br, q, b2.mk)]
                         ELSE d2
  /\ UNCHANGED <<rowVars, provVars, wk, reapQ, tdQ, envVars, ghostVars, budgetVars>>

\* settleSandbox reads the caller's claim (cd), which may differ from the claim the running boot read.
SettleOK(bx, cd) == bx.run /\ bx.boot = "up" /\ (cd # 0 /\ SettleNeedsLayout => bx.lay)
Refused(bx, cd) == bx.run /\ (bx.boot = "refused" \/
                              (bx.boot = "up" /\ cd # 0 /\ SettleNeedsLayout /\ ~bx.lay))

Detached(d) == IF d = 0 THEN TRUE ELSE ~drives[d].ex \/ drives[d].att = 0

\* ------------------------------------------------- platform behaviour
SessionEnds(b) ==         \* timeout, idle stop, or any clean end
  /\ boxes[b].ex /\ boxes[b].run
  /\ boxes' = [boxes EXCEPT ![b] = CleanStop(@)]
  /\ UNCHANGED <<rowVars, provVars, wk, drives, reapQ, tdQ, envVars, ghostVars, budgetVars>>

Abort(b) ==
  /\ boxes[b].ex /\ boxes[b].run /\ aborts < MaxAborts
  /\ boxes' = [boxes EXCEPT ![b] = Aborted(@)]
  /\ aborts' = aborts + 1
  /\ UNCHANGED <<rowVars, provVars, wk, drives, reapQ, tdQ, envVars, ghostVars,
                 sessions, mfail, redeliveries, envCh, bundleCh, wakes>>

\* Some time after a session ends, or after its sandbox is deleted, the drive detaches.
Detach(d) ==
  LET a == drives[d].att IN
  /\ drives[d].ex /\ a # 0
  /\ ~(boxes[a].ex /\ boxes[a].run /\ boxes[a].mount = d)
  /\ drives' = [drives EXCEPT ![d].att = 0]
  /\ UNCHANGED <<rowVars, provVars, wk, boxes, reapQ, tdQ, envVars, ghostVars, budgetVars>>

\* The user works in /workspace of a ready box.
UserWork ==
  LET bx == boxes[rowBox] IN
  /\ status = "awake" /\ bx.ex /\ bx.ok
  /\ IF bx.bound
       THEN /\ drives[bx.mount].con # "work"
            /\ drives' = [drives EXCEPT ![bx.mount].con = "work"]
            /\ workDrive' = bx.mount /\ workBox' = 0
            /\ UNCHANGED boxes
       ELSE /\ rowDrive = 0 /\ ~bx.rw
            /\ boxes' = [boxes EXCEPT ![rowBox].rw = TRUE]
            /\ workBox' = rowBox /\ workDrive' = 0
            /\ UNCHANGED drives
  /\ hasWork' = TRUE
  /\ UNCHANGED <<rowVars, provVars, wk, reapQ, tdQ, envVars, doubleMount, badDel,
                 failedTransient, budgetVars>>

\* ------------------------------------------------------------- provision
ProvClaim ==
  /\ prov = "claim"
  /\ IF status # "provisioning"
       THEN /\ prov' = "none" /\ UNCHANGED <<rowDrive, provD, provEnv, provBox, provEpoch>>
       ELSE LET d == IF rowDrive # 0 THEN rowDrive ELSE IF envDrive THEN rowBox ELSE 0 IN
            /\ rowDrive' = d /\ provD' = d /\ provEnv' = envDrive /\ provBox' = rowBox
            /\ provEpoch' = epoch
            /\ prov' = "fork"
  /\ UNCHANGED <<status, rowBox, rowLaid, retired, epoch, wk, boxes, drives, reapQ, tdQ,
                 envVars, ghostVars, budgetVars>>

\* A failure that is not a not-ready: deleteSandboxAndDriveLater, then failed.
ProvFailNow ==
  /\ IF provD # 0
       THEN /\ tdQ' = tdQ \cup {[b |-> provBox, d |-> provD, ph |-> "stop"]}
            /\ UNCHANGED boxes
       ELSE /\ boxes' = [boxes EXCEPT ![provBox] = NoBox]
            /\ UNCHANGED tdQ
  /\ status' = IF status \in {"provisioning", "awake"} THEN "failed" ELSE status
  /\ retired' = (retired \/ provD # 0)
  /\ prov' = "none"
  /\ UNCHANGED <<rowBox, rowDrive, rowLaid, epoch, provD, provEnv, provBox, provEpoch, wk, drives, reapQ,
                 envVars, ghostVars>>

ProvFork ==
  /\ prov = "fork"
  /\ IF provD = 0 \/ drives[provD].ex
       THEN /\ prov' = "create"
            /\ UNCHANGED <<status, retired, boxes, drives, tdQ, badDel>>
       ELSE IF ~provEnv
         THEN ProvFailNow /\ UNCHANGED drives
         ELSE /\ drives' = [drives EXCEPT ![provD] =
                              [ex |-> TRUE, att |-> 0, own |-> gOwn, con |-> "golden",
                               br |-> gBr /\ ~FixFresh]]
              /\ prov' = "create"
              /\ UNCHANGED <<status, retired, boxes, tdQ, badDel>>
  /\ UNCHANGED <<rowBox, rowDrive, rowLaid, epoch, provD, provEnv, provBox, provEpoch, wk, reapQ, envVars,
                 hasWork, workDrive, workBox, doubleMount, failedTransient, budgetVars>>

\* provisionSandbox: create if missing (mounts fixed for this session), write identity, run boot.
\* An existing stopped box resumes with its own mounts; there is no detach wait here.
ProvCreate ==
  LET bx == boxes[provBox] IN
  /\ prov = "create"
  /\ prov' = "mark"
  /\ IF ~bx.ex
       THEN Start(provBox, [NoBox EXCEPT !.next = provD], provD, provD, FALSE)
       ELSE IF ~bx.run
         THEN /\ (WaitDetach /\ FixProvWait) => Detached(bx.next)
              /\ Start(provBox, bx, bx.next, provD, FALSE)
         ELSE UNCHANGED <<boxes, drives, doubleMount, mfail, sessions>>
  /\ UNCHANGED <<rowVars, provD, provEnv, provBox, provEpoch, wk, reapQ, tdQ, envVars, hasWork, workDrive,
                 workBox, badDel, failedTransient, redeliveries, envCh, bundleCh, wakes, aborts>>

ProvError ==     \* the fork or the create throws
  /\ prov \in {"fork", "create"}
  /\ redeliveries < MaxRedeliveries
  /\ redeliveries' = redeliveries + 1
  /\ ProvFailNow
  /\ UNCHANGED drives
  /\ UNCHANGED <<sessions, mfail, envCh, bundleCh, wakes, aborts>>

\* transitionCloudWorkspace(provisioning -> awake); a lost row is torn down only if archived.
ProvMark ==
  /\ prov = "mark"
  /\ IF status = "provisioning"
       THEN /\ status' = "awake" /\ prov' = "settle"
            /\ UNCHANGED <<retired, boxes, tdQ, badDel>>
       ELSE IF (status = "archived" /\ (epoch = provEpoch + 1 \/ ~FixMarkEpoch))
                \/ ~MarkTearsOnlyArchived
         THEN /\ prov' = "none" /\ UNCHANGED status
              /\ IF provD # 0
                   THEN /\ tdQ' = tdQ \cup {[b |-> provBox, d |-> provD, ph |-> "stop"]}
                        /\ retired' = TRUE /\ UNCHANGED <<boxes, badDel>>
                   ELSE /\ boxes' = [boxes EXCEPT ![provBox] = NoBox]
                        /\ badDel' = (badDel \/ LiveNames(provBox, 0))
                        /\ UNCHANGED <<tdQ, retired>>
         ELSE /\ prov' = "none" /\ UNCHANGED <<status, retired, boxes, tdQ, badDel>>
  /\ UNCHANGED <<rowBox, rowDrive, rowLaid, epoch, provD, provEnv, provBox, provEpoch, wk, drives, reapQ,
                 envVars, hasWork, workDrive, workBox, doubleMount, failedTransient, budgetVars>>

\* settleSandbox; a not-ready (a drive refusal is one) stops the box and fails the row.
ProvSettle ==
  LET bx == boxes[provBox] IN
  /\ prov = "settle"
  /\ ~(bx.run /\ bx.boot = "booting")
  /\ prov' = "none"
  /\ IF SettleOK(bx, provD)
       THEN /\ boxes' = [boxes EXCEPT ![provBox].ok = TRUE]
            /\ rowLaid' = (rowLaid \/ (FixLaid /\ bx.lay /\ provBox = rowBox))
            /\ UNCHANGED <<status, failedTransient>>
       ELSE IF FixProvRetry /\ Refused(bx, provD)
         THEN /\ boxes' = StopIn(boxes, provBox)
              /\ UNCHANGED <<status, rowLaid, failedTransient>>
         ELSE /\ boxes' = StopIn(boxes, provBox)
              /\ status' = IF status \in {"provisioning", "awake"} THEN "failed" ELSE status
              /\ failedTransient' = (failedTransient \/ (Refused(bx, provD) /\ bx.why = "missing"))
              /\ UNCHANGED rowLaid
  /\ UNCHANGED <<rowBox, rowDrive, retired, epoch, provD, provEnv, provBox, provEpoch, wk, drives, reapQ,
                 tdQ, envVars, hasWork, workDrive, workBox, doubleMount, badDel, budgetVars>>

\* The function dies between two steps; QStash may deliver the job again from the top.
ProvDie ==
  /\ prov # "none"
  /\ redeliveries < MaxRedeliveries
  /\ redeliveries' = redeliveries + 1
  /\ prov' \in {"none", "claim"}
  /\ UNCHANGED <<rowVars, provD, provEnv, provBox, provEpoch, wk, boxes, drives, reapQ, tdQ, envVars,
                 ghostVars, sessions, mfail, envCh, bundleCh, wakes, aborts>>

\* ------------------------------------------------------------------ wake
WakeD == IF rowDrive # 0 THEN rowDrive ELSE IF WakeClaimFromEnv /\ envDrive THEN rowBox ELSE 0
WakeL == IF FixLaid THEN rowLaid ELSE WakeD # 0

\* buildSandboxClaim, Sandbox.get, then waitForDriveDetached; a drive held by this
\* running box (a concurrent wake resumed it) counts as done.
WakeStart(w) ==
  LET bx == boxes[rowBox]
      dd == IF rowDrive # 0 THEN rowDrive ELSE bx.next IN
  /\ wk[w].ph = "idle" /\ status = "awake" /\ bx.ex
  /\ wakes < MaxWakes
  /\ wakes' = wakes + 1
  /\ bx.run \/ Detached(dd) \/ ~WaitDetach
  /\ wk' = [wk EXCEPT ![w] = [ph |-> IF bx.run THEN "boot" ELSE "waited", b |-> rowBox,
                               d |-> rowDrive, cd |-> WakeD, cl |-> WakeL]]
  /\ UNCHANGED <<rowVars, provVars, boxes, drives, reapQ, tdQ, envVars, ghostVars,
                 sessions, mfail, redeliveries, envCh, bundleCh, aborts>>

\* sandbox.update({ mounts }) from the row the wake read (a failed drive mount update
\* throws), then writeIdentity + runBoot, which auto-resume a stopped box with those
\* mounts. A box a concurrent wake already resumed is left to that boot (the boot lock).
WakeResume(w) ==
  LET b == wk[w].b
      d == wk[w].d
      bx == boxes[b]
      next == IF d # 0 THEN d ELSE bx.next IN
  /\ wk[w].ph = "waited" /\ bx.ex
  /\ IF d # 0 /\ ~drives[d].ex
       THEN /\ wk' = [wk EXCEPT ![w] = [ph |-> "idle", b |-> 1, d |-> 0, cd |-> 0, cl |-> FALSE]]
            /\ UNCHANGED <<boxes, drives, rowDrive, doubleMount, mfail, sessions>>
       ELSE /\ wk' = [wk EXCEPT ![w].ph = "boot"]
            /\ rowDrive' = IF WakeWritesDrive /\ rowDrive = 0 /\ envDrive THEN rowBox ELSE rowDrive
            /\ IF ~bx.run
                 THEN /\ (WaitDetach /\ FixWakeLock) => Detached(next)
                      /\ Start(b, [bx EXCEPT !.next = next], next, wk[w].cd, wk[w].cl)
                 ELSE /\ boxes' = [boxes EXCEPT ![b].next = next]
                      /\ UNCHANGED <<drives, doubleMount, mfail, sessions>>
  /\ UNCHANGED <<status, rowBox, rowLaid, retired, epoch, provVars, reapQ, tdQ, envVars,
                 hasWork, workDrive, workBox, badDel, failedTransient, redeliveries, envCh,
                 bundleCh, wakes, aborts>>

\* settleSandbox; a refusal stops the box and answers "still starting".
WakeSettle(w) ==
  LET b == wk[w].b
      bx == boxes[b] IN
  /\ wk[w].ph = "boot" /\ bx.ex
  /\ ~(bx.run /\ bx.boot = "booting")
  /\ wk' = [wk EXCEPT ![w] = [ph |-> "idle", b |-> 1, d |-> 0, cd |-> 0, cl |-> FALSE]]
  /\ IF SettleOK(bx, wk[w].cd)
       THEN /\ boxes' = [boxes EXCEPT ![b].ok = TRUE]
            /\ rowLaid' = (rowLaid \/ (FixLaid /\ bx.lay /\ b = rowBox))
       ELSE /\ boxes' = IF Refused(bx, wk[w].cd) THEN StopIn(boxes, b) ELSE boxes
            /\ UNCHANGED rowLaid
  /\ UNCHANGED <<status, rowBox, rowDrive, retired, epoch, provVars, drives, reapQ, tdQ,
                 envVars, ghostVars, budgetVars>>

WakeDie(w) ==
  /\ wk[w].ph # "idle"
  /\ wk' = [wk EXCEPT ![w] = [ph |-> "idle", b |-> 1, d |-> 0, cd |-> 0, cl |-> FALSE]]
  /\ UNCHANGED <<rowVars, provVars, boxes, drives, reapQ, tdQ, envVars, ghostVars, budgetVars>>

\* markSandboxUnavailable: the box is gone, the row is failed.
WakeUnavailable ==
  /\ status = "awake" /\ ~boxes[rowBox].ex
  /\ status' = "failed"
  /\ UNCHANGED <<rowBox, rowDrive, rowLaid, retired, epoch, provVars, wk, boxes, drives, reapQ,
                 tdQ, envVars, ghostVars, budgetVars>>

\* ------------------------------------------------- archive, reap, unarchive
Archive ==
  /\ status \in {"provisioning", "awake", "failed"} /\ epoch < MaxArchives
  /\ status' = "archived" /\ epoch' = epoch + 1
  /\ reapQ' = reapQ \cup {[e |-> epoch + 1, stage |-> "stop"], [e |-> epoch + 1, stage |-> "delete"]}
  /\ boxes' = [boxes EXCEPT ![rowBox].ok = FALSE]
  /\ UNCHANGED <<rowBox, rowDrive, rowLaid, retired, provVars, wk, drives, tdQ, envVars,
                 ghostVars, budgetVars>>

\* The delete stage queues the teardown; this is the user's deletion completing.
ReapRun(j) ==
  /\ j \in reapQ
  /\ reapQ' = reapQ \ {j}
  /\ LET legit == status = "archived" /\ j.e = epoch
         runs == legit \/ ~ReapChecksEpoch IN
     IF ~runs THEN UNCHANGED <<boxes, tdQ, retired, hasWork, badDel>>
     ELSE IF j.stage = "stop"
       THEN /\ boxes' = StopIn(boxes, rowBox)
            /\ UNCHANGED <<tdQ, retired, hasWork, badDel>>
       ELSE /\ IF rowDrive # 0
                 THEN /\ tdQ' = tdQ \cup {[b |-> rowBox, d |-> rowDrive, ph |-> "stop"]}
                      /\ UNCHANGED <<boxes, badDel>>
                 ELSE /\ boxes' = [boxes EXCEPT ![rowBox] = NoBox]
                      /\ badDel' = (badDel \/ LiveNames(rowBox, 0))
                      /\ UNCHANGED tdQ
            /\ retired' = TRUE
            /\ hasWork' = (hasWork /\ ~legit)
  /\ UNCHANGED <<status, rowBox, rowDrive, rowLaid, epoch, provVars, wk, drives, envVars,
                 workDrive, workBox, doubleMount, failedTransient, budgetVars>>

\* Resumable while the old box exists; otherwise a new box name, the drive name kept.
Unarchive ==
  /\ status = "archived"
  /\ LET resumable == boxes[rowBox].ex /\ ~(FixRetire /\ retired) IN
     IF resumable
       THEN /\ status' = "awake" /\ retired' = FALSE
            /\ UNCHANGED <<rowBox, rowDrive, rowLaid, prov>>
       ELSE /\ rowBox = 1 /\ prov = "none"
            /\ status' = "provisioning" /\ rowBox' = 2 /\ retired' = FALSE
            /\ rowDrive' = IF FixRetire /\ retired THEN 0 ELSE rowDrive
            /\ rowLaid' = (rowLaid /\ ~(FixRetire /\ retired))
            /\ prov' = "claim"
  /\ UNCHANGED <<epoch, provD, provEnv, provBox, provEpoch, wk, boxes, drives, reapQ, tdQ, envVars,
                 ghostVars, budgetVars>>

\* teardownSandbox: stop, wait for the drive to detach, delete the box, delete the drive.
\* Keyed on names only; it never reads the row.
TdRun(j) ==
  /\ j \in tdQ
  /\ CASE j.ph = "stop" ->
          /\ boxes' = StopIn(boxes, j.b)
          /\ tdQ' = (tdQ \ {j}) \cup {[j EXCEPT !.ph = "wait"]}
          /\ UNCHANGED <<drives, badDel, redeliveries>>
       [] j.ph = "wait" ->
          /\ Detached(j.d)
          /\ boxes' = [boxes EXCEPT ![j.b] = NoBox]
          /\ badDel' = (badDel \/ (boxes[j.b].ex /\ LiveNames(j.b, 0)))
          /\ tdQ' = (tdQ \ {j}) \cup {[j EXCEPT !.ph = "deldrive"]}
          /\ UNCHANGED <<drives, redeliveries>>
       [] j.ph = "deldrive" ->
          IF drives[j.d].ex /\ drives[j.d].att # 0
            THEN  \* Vercel refuses; QStash delivers the job again from the top
                 /\ redeliveries < MaxRedeliveries /\ redeliveries' = redeliveries + 1
                 /\ tdQ' = (tdQ \ {j}) \cup {[j EXCEPT !.ph = "stop"]}
                 /\ UNCHANGED <<boxes, drives, badDel>>
            ELSE /\ drives' = [drives EXCEPT ![j.d] = NoDrive]
                 /\ badDel' = (badDel \/ (drives[j.d].ex /\ LiveNames(0, j.d)))
                 /\ \E dup \in (IF redeliveries < MaxRedeliveries THEN BOOLEAN ELSE {FALSE}) :
                      /\ tdQ' = IF dup THEN (tdQ \ {j}) \cup {[j EXCEPT !.ph = "stop"]} ELSE tdQ \ {j}
                      /\ redeliveries' = IF dup THEN redeliveries + 1 ELSE redeliveries
                 /\ UNCHANGED boxes
  /\ UNCHANGED <<rowVars, provVars, wk, reapQ, envVars, hasWork, workDrive, workBox,
                 doubleMount, failedTransient, sessions, mfail, envCh, bundleCh, wakes, aborts>>

\* After TEARDOWN_ATTEMPTS the job logs and gives up.
TdAbandon(j) ==
  /\ j \in tdQ /\ j.ph = "wait" /\ ~Detached(j.d)
  /\ tdQ' = tdQ \ {j}
  /\ UNCHANGED <<rowVars, provVars, wk, boxes, drives, reapQ, envVars, ghostVars, budgetVars>>

Named(d) == rowDrive = d /\ ~(status = "archived" /\ retired)
Orphan(d) == drives[d].ex /\ ~Named(d) /\ ~(\E j \in tdQ : j.d = d)
             /\ ~(prov # "none" /\ provD = d)

Sweep(d) ==
  /\ HasSweep /\ Orphan(d) /\ drives[d].att = 0
  /\ drives' = [drives EXCEPT ![d] = NoDrive]
  /\ UNCHANGED <<rowVars, provVars, wk, boxes, reapQ, tdQ, envVars, ghostVars, budgetVars>>

\* ----------------------------------------------------------- environment
\* A release with the flag on, or a promote of a workspace with a drive.
NewGoldenDrive ==
  /\ envCh < MaxEnvChanges /\ envCh' = envCh + 1
  /\ envDrive' = TRUE
  /\ gOwn' = IF StripIdentity THEN "none" ELSE "other"
  /\ gBr' \in BOOLEAN
  /\ UNCHANGED <<rowVars, provVars, wk, boxes, drives, reapQ, tdQ, bundle, ghostVars,
                 sessions, mfail, redeliveries, bundleCh, wakes, aborts>>

\* A release with the flag off, or a promote of a source without a drive.
LeaveDriveMode ==
  /\ envDrive /\ envCh < MaxEnvChanges /\ envCh' = envCh + 1
  /\ envDrive' = FALSE
  /\ UNCHANGED <<rowVars, provVars, wk, boxes, drives, reapQ, tdQ, gOwn, gBr, bundle, ghostVars,
                 sessions, mfail, redeliveries, bundleCh, wakes, aborts>>

\* The environment's bundleSha moves, including back to a bundle without drive support.
BundleChange ==
  /\ bundleCh < MaxBundleChanges /\ bundleCh' = bundleCh + 1
  /\ bundle' = IF bundle = "aware" THEN "old" ELSE "aware"
  /\ UNCHANGED <<rowVars, provVars, wk, boxes, drives, reapQ, tdQ, envDrive, gOwn, gBr,
                 ghostVars, sessions, mfail, redeliveries, envCh, wakes, aborts>>

Next ==
  \/ ProvClaim \/ ProvFork \/ ProvCreate \/ ProvError \/ ProvMark \/ ProvSettle \/ ProvDie
  \/ \E w \in Wakers : WakeStart(w) \/ WakeResume(w)
                       \/ WakeSettle(w) \/ WakeDie(w)
  \/ WakeUnavailable
  \/ \E b \in Boxes : Boot(b) \/ SessionEnds(b) \/ Abort(b)
  \/ \E d \in DriveIds : Detach(d) \/ Sweep(d)
  \/ UserWork
  \/ Archive \/ Unarchive
  \/ \E j \in reapQ : ReapRun(j)
  \/ \E j \in tdQ : TdRun(j) \/ TdAbandon(j)
  \/ NewGoldenDrive \/ LeaveDriveMode \/ BundleChange

Spec == Init /\ [][Next]_vars

WakerSymmetry == Permutations(Wakers)

Bound == sessions <= MaxSessions

\* ------------------------------------------------------------------ rules
\* Work exists where the ghost says until the user's deletion completes (the legit reap).
NoWorkLost ==
  hasWork =>
    /\ workDrive # 0 => drives[workDrive].ex /\ drives[workDrive].con = "work"
    /\ workBox # 0 => boxes[workBox].ex /\ boxes[workBox].rw

\* A ready box shows this workspace's drive, laid out, holding its work.
NeverEmptyShownAsWork ==
  LET bx == boxes[rowBox] IN
  (status = "awake" /\ bx.ok) =>
    /\ bx.run
    /\ rowDrive # 0 => bx.bound /\ bx.mount = rowDrive /\ drives[rowDrive].own = "self"
    /\ (hasWork /\ workDrive # 0) => bx.bound /\ bx.mount = workDrive
    /\ (hasWork /\ workBox # 0) => workBox = rowBox

SingleWriter == ~doubleMount

NoTeardownOfLive == ~badDel

DriveOnlyByProvision == [][(rowDrive = 0 /\ rowDrive' # 0) => ProvClaim]_vars

\* A row without a drive gets no mount, no drive identity, no layout: today's box.
NoDriveUnchanged ==
  rowDrive = 0 => LET bx == boxes[rowBox] IN
    bx.ex => (bx.mount = 0 /\ bx.next = 0 /\ bx.cD = 0 /\ ~bx.bound)

\* A live row whose every future wake refuses: drive gone, foreign, or unlaid while
\* the wake claims laid-out. Nothing in the code moves such a row on, so it loops forever.
Stuck ==
  /\ status = "awake" /\ rowDrive # 0 /\ prov = "none" /\ boxes[rowBox].ex
  /\ ~(boxes[rowBox].run /\ ~boxes[rowBox].cL)
  /\ \/ ~drives[rowDrive].ex
     \/ drives[rowDrive].own = "other"
     \/ (drives[rowDrive].own = "none" /\ WakeL)
NoStuckForever == ~Stuck

FreshForkIsFetched == \A d \in DriveIds : drives[d].con # "stale"

TransientIsRetried == ~failedTransient

NoOrphanForever == \A d \in DriveIds : Orphan(d) => HasSweep

=============================================================================
