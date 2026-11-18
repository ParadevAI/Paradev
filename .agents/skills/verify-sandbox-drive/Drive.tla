----------------------------- MODULE Drive -----------------------------
(* One cloud workspace row, its boxes (sandbox ids 1 and 2), their        *)
(* workspace drives (drive i is drive-<box i>), one environment, and every *)
(* step of the drive lifecycle. Each provider call or DB write is its own *)
(* action, so a function can die between any two of them.                *)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  \* Guards the code has. TRUE is the code; FALSE is a broken config.
  WaitDetach,          \* wakeSandbox waits for the drive to detach before update + resume
  BootRefusesMissing,  \* layout_drive refuses drive.missing
  SettleNeedsLayout,   \* settleSandbox requires a drive.layout stamp
  ReapChecksEpoch,     \* reapArchivedCloudWorkspace: isStillArchived(archivedAt)
  LostRowLeftToReap,   \* provision: a lost transition tears nothing down; the archive's reap does
  RetireNames,         \* the reap and a failed provision retire the row's names in the write that commits to the teardown
  ResumeLock,          \* sandboxResumeLock: one caller at a time runs a box's drive check and resume
  StripIdentity,       \* a golden drive carries no owner sentinel (release, promote)
  TeardownChecksRows,  \* teardownSandbox: liveReferences before each destructive call
  DowngradeRefused,    \* superset-boot: drive.downgrade before a re-exec into a script without drive support
  FreshByLayout,       \* superset-boot: SUPERSET_DRIVE_FRESH at the layout that writes the sentinel
  LaidColumn,          \* drive_laid_out_at: a wake claims laid-out only once a settle saw the layout
  ProvRetriesMissing,  \* provision: a SandboxDriveMissingError leaves the row live, asleep
  RefusalLimitOn,      \* settleSandbox: DRIVE_REFUSAL_LIMIT persistent refusals end in failed
  SweepRuns,           \* the drive sweep is run (it is a workflow_dispatch job, by hand)
  WakeClaimFromEnv,    \* broken only: a wake's claim names the environment's drive
  WakeWritesDrive,     \* broken only: a wake writes a drive name to the row
  \* Fixes the code does not have. FALSE is the code.
  FixRunningResume,  \* a call that found its box running never resumes it later without the drive check
  FixFreshDurable,   \* "fresh fork" is recorded on the drive until its first checkout
  FixSweepNamed,     \* the sweep keeps every drive a row still names, whatever its status
  FixOneProvision,   \* an unarchive starts no second provision while one may still run for the row
  FixOneProvByDrive, \* #9847: the lock is keyed on the drive, a create waits for the drive, and
                     \* provisioning -> awake/failed only on the job's own box; a lost job tears its box down
                     \* and keeps the drive
  GuardAnyRow,       \* #9847: liveReferences keeps what any row names, whatever its status
  \* Bounds
  RefusalLimit,  \* DRIVE_REFUSAL_LIMIT
  MaxSessions, MaxMountFails, MaxRedeliveries, MaxArchives, MaxEnvChanges,
  MaxBundleChanges, MaxWakes, MaxAborts, MaxSweeps,
  Wakers,        \* concurrent wake calls, as model values
  ProvJobs       \* provision jobs that can run at once; the first is the create's

\* Box 0 is a retired name (nextSandboxNameFor): never created.
Boxes == {0, 1, 2}
DriveIds == {1, 2}
FirstJob == CHOOSE j \in ProvJobs : TRUE

VARIABLES
  status,    \* cloud_workspaces.status: provisioning | awake (awake or asleep) | failed | archived
  rowBox,    \* cloud_workspaces.provider_sandbox_id: 1 or 2
  rowDrive,  \* cloud_workspaces.drive_name: 0 (none), 1 or 2
  rowLaid,   \* cloud_workspaces.drive_laid_out_at is set
  epoch,     \* archive count; deleted_at in the reap job
  graceOver, \* the current archive is older than its grace period
  pj,        \* provision jobs: [pc, d, env, box, ep, forked]
  wk,        \* wake calls: [ph, b, d, cd, cl, laid, run]
  boxes,     \* the Vercel sandboxes
  drives,    \* the Vercel drives
  reapQ,     \* QStash reap jobs: [e, stage]
  tdQ,       \* QStash teardown jobs: [b, d, ph, ld]
  sweepD,    \* the drive the sweep listed as an orphan and is about to delete, or 0
  locked,    \* boxes whose resume lock a call holds
  reprovs,   \* unarchives that reprovisioned (bound: one)
  envDrive,  \* environments.golden_drive_name is set and the drives flag is on
  gOwn,      \* the golden drive's owner sentinel: none | other
  gBr,       \* the golden drive's checkout already has this workspace's branch
  bundle,    \* the environment's pinned bundle: aware | old (no drive support)
  hasWork, workDrive, workBox,            \* ghost: the user's work and where it is
  doubleMount, badDel, failedTransient,   \* ghosts for the rules
  sessions, mfail, redeliveries, envCh, bundleCh, wakes, aborts, sweeps   \* bounds

vars == <<status, rowBox, rowDrive, rowLaid, epoch, graceOver, pj, wk, boxes, drives,
          reapQ, tdQ, sweepD, locked, reprovs, envDrive, gOwn, gBr, bundle, hasWork, workDrive, workBox,
          doubleMount, badDel, failedTransient,
          sessions, mfail, redeliveries, envCh, bundleCh, wakes, aborts, sweeps>>
rowVars == <<status, rowBox, rowDrive, rowLaid, epoch, graceOver>>
envVars == <<envDrive, gOwn, gBr, bundle>>
workVars == <<hasWork, workDrive, workBox>>
ghostVars == <<hasWork, workDrive, workBox, doubleMount, badDel, failedTransient>>
budgetVars == <<sessions, mfail, redeliveries, envCh, bundleCh, wakes, aborts, sweeps>>

NoBox == [ex |-> FALSE, run |-> FALSE, mount |-> 0, next |-> 0, cD |-> 0, cL |-> FALSE,
          boot |-> "none", why |-> "none", bound |-> FALSE, lay |-> FALSE, fresh |-> FALSE,
          ok |-> FALSE, root |-> "aware", sroot |-> "aware", mk |-> FALSE, smk |-> FALSE,
          rw |-> FALSE, streak |-> 0, sstreak |-> 0]
NoDrive == [ex |-> FALSE, att |-> 0, own |-> "none", con |-> "golden", br |-> FALSE, fr |-> FALSE]
IdleJob == [pc |-> "none", d |-> 0, env |-> FALSE, box |-> 1, ep |-> 0, forked |-> FALSE]
IdleWake == [ph |-> "idle", b |-> 1, d |-> 0, cd |-> 0, cl |-> FALSE, laid |-> FALSE, run |-> FALSE]

Live == status \in {"provisioning", "awake"}
\* What liveReferences reads: a row not archived or failed names its box and drive.
LiveBox(b) == Live /\ rowBox = b
LiveDrive(d) == Live /\ d # 0 /\ rowDrive = d
ProvIdle == \A j \in ProvJobs : pj[j].pc = "none"
\* sandboxResumeLock's key: the drive's name when there is one, else the box's.
LockKey(b, d) == IF FixOneProvByDrive /\ d # 0 THEN 10 + d ELSE b

Init ==
  /\ status = "provisioning" /\ rowBox = 1 /\ rowDrive = 0 /\ rowLaid = FALSE
  /\ epoch = 0 /\ graceOver = FALSE
  /\ pj = [j \in ProvJobs |-> IF j = FirstJob THEN [IdleJob EXCEPT !.pc = "claim"] ELSE IdleJob]
  /\ wk = [w \in Wakers |-> IdleWake]
  /\ boxes = [b \in Boxes |-> NoBox] /\ drives = [d \in DriveIds |-> NoDrive]
  /\ reapQ = {} /\ tdQ = {} /\ sweepD = 0 /\ locked = {} /\ reprovs = 0
  /\ envDrive \in BOOLEAN /\ gOwn = IF StripIdentity THEN "none" ELSE "other"
  /\ gBr \in BOOLEAN /\ bundle = "aware"
  /\ hasWork = FALSE /\ workDrive = 0 /\ workBox = 0
  /\ doubleMount = FALSE /\ badDel = FALSE /\ failedTransient = FALSE
  /\ sessions = 0 /\ mfail = 0 /\ redeliveries = 0 /\ envCh = 0 /\ bundleCh = 0
  /\ wakes = 0 /\ aborts = 0 /\ sweeps = 0

\* ---------------------------------------------------------------- boxes
\* The boot log is on the root disk; a boot that refused for good, or started
\* host-service without the layout, extends the streak persistentDriveRefusals counts.
Persistent(bx) == (bx.boot = "refused" /\ bx.why # "missing") \/ (bx.boot = "up" /\ ~bx.lay)
Ended(bx) == [bx EXCEPT !.run = FALSE, !.boot = "none", !.why = "none", !.bound = FALSE,
                        !.lay = FALSE, !.fresh = FALSE, !.ok = FALSE,
                        !.streak = IF Persistent(bx) THEN bx.streak + 1 ELSE 0]
\* A clean end takes the root snapshot. The drive stays attached until Detach.
CleanStop(bx) == LET e == Ended(bx) IN [e EXCEPT !.sroot = bx.root, !.smk = bx.mk, !.sstreak = e.streak]
\* An abort rolls the root disk (and its boot log) back; the drive does not roll back.
Aborted(bx) == LET e == Ended(bx) IN [e EXCEPT !.root = bx.sroot, !.mk = bx.smk, !.streak = bx.sstreak]
StopIn(bs, b) == IF bs[b].ex /\ bs[b].run THEN [bs EXCEPT ![b] = CleanStop(bs[b])] ELSE bs

Detached(d) == IF d = 0 THEN TRUE ELSE ~drives[d].ex \/ drives[d].att = 0

\* A session starts with the mounts set for it; a mount can transiently fail.
\* Vercel is not trusted to refuse a drive that is still attached: that is doubleMount.
Start(b, base, m, cd, cl) ==
  \E fail \in (IF m # 0 /\ drives[m].ex /\ mfail < MaxMountFails THEN BOOLEAN ELSE {FALSE}) :
    LET mm == IF m # 0 /\ drives[m].ex /\ ~fail THEN m ELSE 0 IN
    /\ boxes' = [boxes EXCEPT ![b] = [base EXCEPT !.ex = TRUE, !.run = TRUE, !.mount = mm,
                   !.cD = cd, !.cL = cl, !.boot = "p1", !.why = "none", !.bound = FALSE,
                   !.lay = FALSE, !.fresh = FALSE, !.ok = FALSE]]
    /\ drives' = IF mm # 0 THEN [drives EXCEPT ![mm].att = b] ELSE drives
    /\ doubleMount' = (doubleMount \/ (mm # 0 /\ drives[mm].att # 0))
    /\ mfail' = IF fail THEN mfail + 1 ELSE mfail
    /\ sessions' = sessions + 1

\* ------------------------------------------------------- superset-boot
LayoutOf(bx, ds) ==
  IF bx.mount = 0 THEN (IF bx.cD # 0 /\ BootRefusesMissing THEN "missing" ELSE "none")
  ELSE LET o == ds[bx.mount].own IN
       IF o = "other" THEN "foreign"
       ELSE IF o = "none" /\ bx.cL THEN "unlaid"
       ELSE "bound"
\* The sentinel is written at the first layout; SUPERSET_DRIVE_FRESH is set then.
AfterLayout(bx, ds, r) ==
  CASE r = "bound" -> [bx EXCEPT !.bound = TRUE, !.lay = TRUE,
                                 !.fresh = bx.fresh \/ ds[bx.mount].own = "none"]
    [] r = "none" -> bx
    [] OTHER -> [bx EXCEPT !.boot = "refused", !.why = r]
OwnAfter(ds, bx, r) ==
  IF r = "bound" /\ ds[bx.mount].own = "none"
    THEN [ds EXCEPT ![bx.mount].own = "self", ![bx.mount].fr = FixFreshDurable]
    ELSE ds

\* layout_drive, run by the script already on the root disk.
Boot1(b) ==
  LET bx == boxes[b] IN
  /\ bx.ex /\ bx.run /\ bx.boot = "p1"
  /\ IF bx.root = "aware"
       THEN LET r == LayoutOf(bx, drives) IN
            /\ boxes' = [boxes EXCEPT ![b] = LET l == AfterLayout(bx, drives, r) IN
                           IF l.boot = "refused" THEN l ELSE [l EXCEPT !.boot = "p2"]]
            /\ drives' = OwnAfter(drives, bx, r)
       ELSE /\ boxes' = [boxes EXCEPT ![b].boot = "p2"]
            /\ UNCHANGED drives
  /\ UNCHANGED <<rowVars, pj, wk, reapQ, tdQ, sweepD, envVars, ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* checkout_one on the drive. golden = the golden's copy, unfetched; fresh =
\* fetched for this workspace; stale = kept unfetched as if it were work.
DriveCheckout(c, br, isFresh) ==
  IF c = "golden" THEN (IF br /\ ~isFresh THEN "stale" ELSE "fresh") ELSE c

\* apply-rootfs installs the pinned bundle's script; drive.downgrade if a drive
\* is laid out and that script lacks the drive-contract line; a changed script
\* re-execs (layout again, SUPERSET_DRIVE_FRESH kept); the checkout; host-service.
Boot2(b) ==
  LET bx == boxes[b]
      q == bundle IN
  /\ bx.ex /\ bx.run /\ bx.boot = "p2"
  /\ IF DowngradeRefused /\ bx.bound /\ q = "old"
       THEN /\ boxes' = [boxes EXCEPT ![b] = [bx EXCEPT !.root = q, !.boot = "refused",
                                                         !.why = "downgrade"]]
            /\ UNCHANGED drives
       ELSE
         LET reexec == q # bx.root
             b1 == [bx EXCEPT !.root = q, !.lay = IF reexec THEN FALSE ELSE bx.lay]
             r2 == IF reexec /\ q = "aware" THEN LayoutOf(b1, drives) ELSE "skip"
             b2 == IF r2 = "skip" THEN b1 ELSE AfterLayout(b1, drives, r2)
             d2 == IF r2 = "skip" THEN drives ELSE OwnAfter(drives, b1, r2)
             dm == b2.mount
             isFresh == IF FreshByLayout THEN b2.fresh \/ (dm # 0 /\ d2[dm].fr) ELSE FALSE
         IN IF b2.boot = "refused"
              THEN /\ boxes' = [boxes EXCEPT ![b] = b2] /\ drives' = d2
              ELSE /\ boxes' = [boxes EXCEPT ![b] = [b2 EXCEPT !.boot = "up",
                                  !.mk = IF b2.bound THEN b2.mk ELSE TRUE]]
                   /\ drives' =
                        IF b2.bound /\ q = "aware"
                          THEN [d2 EXCEPT ![dm].con = DriveCheckout(d2[dm].con, d2[dm].br, isFresh),
                                          ![dm].fr = FALSE]
                        ELSE IF b2.bound   \* a script without drive support, on the bound drive
                          THEN [d2 EXCEPT ![dm].con = IF b2.mk THEN @ ELSE
                                  CASE @ = "work" -> "clobbered"
                                    [] @ \in {"golden", "stale"} -> "fresh"
                                    [] OTHER -> @]
                          ELSE d2
  /\ UNCHANGED <<rowVars, pj, wk, reapQ, tdQ, sweepD, envVars, ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* settleSandbox, with the caller's claim cd.
SettleOK(bx, cd) == bx.run /\ bx.boot = "up" /\ (cd # 0 /\ SettleNeedsLayout => bx.lay)
Refused(bx, cd) == bx.run /\ (bx.boot = "refused" \/
                              (bx.boot = "up" /\ cd # 0 /\ SettleNeedsLayout /\ ~bx.lay))
\* SandboxDriveRefusedError: this boot and the ones before it refused for good.
Terminal(bx) == RefusalLimitOn /\ Persistent(bx) /\ bx.streak + 1 >= RefusalLimit
Booting(bx) == bx.run /\ bx.boot \in {"p1", "p2"}

\* ------------------------------------------------- platform behaviour
SessionEnds(b) ==
  /\ boxes[b].ex /\ boxes[b].run
  /\ boxes' = [boxes EXCEPT ![b] = CleanStop(@)]
  /\ UNCHANGED <<rowVars, pj, wk, drives, reapQ, tdQ, sweepD, envVars, ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

Abort(b) ==
  /\ boxes[b].ex /\ boxes[b].run /\ aborts < MaxAborts
  /\ boxes' = [boxes EXCEPT ![b] = Aborted(@)]
  /\ aborts' = aborts + 1
  /\ UNCHANGED <<rowVars, pj, wk, drives, reapQ, tdQ, sweepD, envVars, ghostVars,
                 sessions, mfail, redeliveries, envCh, bundleCh, wakes, sweeps>>
  /\ UNCHANGED <<locked, reprovs>>

Detach(d) ==
  LET a == drives[d].att IN
  /\ drives[d].ex /\ a # 0
  /\ ~(boxes[a].ex /\ boxes[a].run /\ boxes[a].mount = d)
  /\ drives' = [drives EXCEPT ![d].att = 0]
  /\ UNCHANGED <<rowVars, pj, wk, boxes, reapQ, tdQ, sweepD, envVars, ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

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
  /\ UNCHANGED <<rowVars, pj, wk, reapQ, tdQ, sweepD, envVars, doubleMount, badDel,
                 failedTransient, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* ------------------------------------------------------------- provision
TdJob(b, d, st) == [b |-> b, d |-> d, ph |-> "check", ld |-> FALSE]
\* deleteSandboxAndDriveLater: a box without a drive is deleted now.
TearDown(b, d, st) ==
  IF d # 0
    THEN /\ tdQ' = tdQ \cup {TdJob(b, d, st)} /\ UNCHANGED <<boxes, badDel>>
    ELSE /\ boxes' = [boxes EXCEPT ![b] = NoBox]
         /\ badDel' = (badDel \/ (boxes[b].ex /\ LiveBox(b)))
         /\ UNCHANGED tdQ

ProvClaim(j) ==
  /\ pj[j].pc = "claim"
  /\ IF status # "provisioning"
       THEN /\ pj' = [pj EXCEPT ![j] = IdleJob] /\ UNCHANGED rowDrive
       ELSE LET d == IF rowDrive # 0 THEN rowDrive ELSE IF envDrive THEN rowBox ELSE 0 IN
            /\ rowDrive' = d
            /\ pj' = [pj EXCEPT ![j] = [pc |-> "fork", d |-> d, env |-> envDrive, box |-> rowBox,
                                         ep |-> epoch, forked |-> FALSE]]
  /\ UNCHANGED <<status, rowBox, rowLaid, epoch, graceOver, wk, boxes, drives, reapQ, tdQ,
                 sweepD, envVars, ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* deleteSandboxAndDriveLater for a box the caller itself gives up on.
OwnTearDown(b, d) ==
  IF d # 0 THEN /\ tdQ' = tdQ \cup {TdJob(b, d, "failed")} /\ UNCHANGED boxes
  ELSE /\ boxes' = [boxes EXCEPT ![b] = NoBox] /\ UNCHANGED tdQ

\* A failure that is not a not-ready: the transition to failed retires the names
\* (a new box name, and no drive if this job forked it); then the old ones go.
ProvFailNow(j) ==
  LET J == pj[j]
      won == status \in {"provisioning", "awake"} /\ (FixOneProvByDrive => rowBox = J.box) IN
  /\ status' = IF won THEN "failed" ELSE status
  /\ IF won /\ RetireNames
       THEN /\ rowBox' = 0
            /\ rowDrive' = IF J.forked THEN 0 ELSE rowDrive
            /\ rowLaid' = (rowLaid /\ ~J.forked)
       ELSE UNCHANGED <<rowBox, rowDrive, rowLaid>>
  /\ IF won \/ ~RetireNames
       THEN OwnTearDown(J.box, IF J.forked THEN J.d ELSE 0)
       ELSE UNCHANGED <<boxes, tdQ>>
  /\ pj' = [pj EXCEPT ![j] = IdleJob]
  /\ UNCHANGED <<epoch, graceOver, wk, drives, reapQ, sweepD, envVars, workVars,
                 doubleMount, badDel, failedTransient>>

\* forkWorkspaceDrive: existing by name, else a fork; a fresh fork clears drive_laid_out_at.
ProvFork(j) ==
  LET J == pj[j] IN
  /\ J.pc = "fork"
  /\ IF J.d = 0 \/ drives[J.d].ex
       THEN /\ pj' = [pj EXCEPT ![j].pc = "create"]
            /\ UNCHANGED <<status, rowBox, rowDrive, rowLaid, boxes, drives, tdQ, badDel>>
       ELSE IF ~J.env
         THEN ProvFailNow(j)
         ELSE /\ drives' = [drives EXCEPT ![J.d] =
                              [ex |-> TRUE, att |-> 0, own |-> gOwn, con |-> "golden",
                               br |-> gBr, fr |-> FALSE]]
              /\ rowLaid' = FALSE
              /\ pj' = [pj EXCEPT ![j].pc = "create", ![j].forked = TRUE]
              /\ UNCHANGED <<status, rowBox, rowDrive, boxes, tdQ, badDel>>
  /\ UNCHANGED <<epoch, graceOver, wk, reapQ, sweepD, envVars, workVars,
                 doubleMount, failedTransient, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* provisionSandbox under the box's resume lock: create if missing (mounts fixed for
\* this session, no detach wait); a stopped box: wait for its drive, update the
\* mounts, and writeIdentity resumes it; a running box: writeIdentity next (ProvWrite).
ProvCreate(j) ==
  LET J == pj[j]
      bx == boxes[J.box]
      next == IF J.d # 0 THEN J.d ELSE bx.next IN
  /\ J.pc = "create"
  /\ ResumeLock => LockKey(J.box, J.d) \notin locked
  /\ IF ~bx.ex
       THEN /\ pj' = [pj EXCEPT ![j].pc = "mark"]
            /\ (FixOneProvByDrive /\ WaitDetach) => Detached(J.d)
            /\ Start(J.box, [NoBox EXCEPT !.next = J.d], J.d, J.d, FALSE)
            /\ UNCHANGED locked
       ELSE IF ~bx.run
         THEN /\ pj' = [pj EXCEPT ![j].pc = "mark"]
              /\ WaitDetach => Detached(next)
              /\ Start(J.box, [bx EXCEPT !.next = next], next, J.d, FALSE)
              /\ UNCHANGED locked
         ELSE /\ pj' = [pj EXCEPT ![j].pc = "write"]
              /\ locked' = IF ResumeLock THEN locked \cup {LockKey(J.box, J.d)} ELSE locked
              /\ UNCHANGED <<boxes, drives, doubleMount, mfail, sessions>>
  /\ UNCHANGED <<rowVars, wk, reapQ, tdQ, sweepD, envVars, workVars, badDel, failedTransient,
                 redeliveries, envCh, bundleCh, wakes, aborts, sweeps, reprovs>>

\* writeIdentity and runBoot on a box that was running when read: if its session
\* ended meanwhile, the SDK resumes it, with no drive check.
ProvWrite(j) ==
  LET J == pj[j]
      bx == boxes[J.box] IN
  /\ J.pc = "write"
  /\ pj' = [pj EXCEPT ![j].pc = "mark"]
  /\ locked' = locked \ {LockKey(J.box, J.d)}
  /\ IF bx.ex /\ ~bx.run
       THEN /\ (WaitDetach /\ FixRunningResume) => Detached(bx.next)
            /\ Start(J.box, bx, bx.next, J.d, FALSE)
       ELSE UNCHANGED <<boxes, drives, doubleMount, mfail, sessions>>
  /\ UNCHANGED <<rowVars, wk, reapQ, tdQ, sweepD, envVars, workVars, badDel, failedTransient,
                 redeliveries, envCh, bundleCh, wakes, aborts, sweeps, reprovs>>

ProvError(j) ==
  /\ pj[j].pc \in {"fork", "create"}
  /\ ResumeLock /\ pj[j].pc = "create" => LockKey(pj[j].box, pj[j].d) \notin locked
  /\ redeliveries < MaxRedeliveries
  /\ redeliveries' = redeliveries + 1
  /\ ProvFailNow(j)
  /\ UNCHANGED <<sessions, mfail, envCh, bundleCh, wakes, aborts, sweeps>>
  /\ UNCHANGED <<locked, reprovs>>

\* transitionCloudWorkspace(provisioning -> awake, providerSandboxId = its box);
\* a lost row is left to the archive's reap.
ProvMark(j) ==
  LET J == pj[j] IN
  /\ J.pc = "mark"
  /\ IF status = "provisioning" /\ (FixOneProvByDrive => rowBox = J.box)
       THEN /\ status' = "awake" /\ rowBox' = J.box
            /\ pj' = [pj EXCEPT ![j].pc = "settle"]
            /\ UNCHANGED <<boxes, tdQ, badDel>>
       ELSE /\ pj' = [pj EXCEPT ![j] = IdleJob]
            /\ UNCHANGED <<status, rowBox>>
            /\ IF FixOneProvByDrive /\ rowBox # J.box
                 THEN IF J.d # 0
                        THEN /\ tdQ' = tdQ \cup {[TdJob(J.box, J.d, "lost") EXCEPT !.ld = TRUE]}
                             /\ UNCHANGED <<boxes, badDel>>
                        ELSE TearDown(J.box, 0, "lost")
                 ELSE IF status = "archived" /\ ~LostRowLeftToReap
                 THEN TearDown(J.box, J.d, "archived")
                 ELSE UNCHANGED <<boxes, tdQ, badDel>>
  /\ UNCHANGED <<rowDrive, rowLaid, epoch, graceOver, wk, drives, reapQ, sweepD, envVars,
                 workVars, doubleMount, failedTransient, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* settleSandbox, then recordDriveLaidOut. A SandboxDriveMissingError leaves the row
\* asleep with the box stopped; a terminal refusal or a timeout keeps the box, stopped,
\* and fails the row.
ProvSettle(j) ==
  LET J == pj[j]
      bx == boxes[J.box] IN
  /\ J.pc = "settle"
  /\ ~Booting(bx)
  /\ pj' = [pj EXCEPT ![j] = IdleJob]
  /\ IF SettleOK(bx, J.d)
       THEN /\ boxes' = [boxes EXCEPT ![J.box].ok = TRUE]
            /\ rowLaid' = (rowLaid \/ (LaidColumn /\ J.d # 0))
            /\ UNCHANGED <<status, failedTransient>>
       ELSE IF Refused(bx, J.d) /\ ~Terminal(bx) /\ ProvRetriesMissing
         THEN /\ boxes' = StopIn(boxes, J.box)
              /\ UNCHANGED <<status, rowLaid, failedTransient>>
         ELSE /\ boxes' = StopIn(boxes, J.box)
              /\ status' = IF status \in {"provisioning", "awake"} THEN "failed" ELSE status
              /\ failedTransient' = (failedTransient \/ (Refused(bx, J.d) /\ bx.why = "missing"))
              /\ UNCHANGED rowLaid
  /\ UNCHANGED <<rowBox, rowDrive, epoch, graceOver, wk, drives, reapQ, tdQ, sweepD, envVars,
                 workVars, doubleMount, badDel, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* The function dies between two steps; QStash may deliver the job again from the top.
ProvDie(j) ==
  /\ pj[j].pc # "none"
  /\ redeliveries < MaxRedeliveries
  /\ redeliveries' = redeliveries + 1
  /\ pj' \in {[pj EXCEPT ![j] = IdleJob], [pj EXCEPT ![j] = [IdleJob EXCEPT !.pc = "claim"]]}
  /\ locked' = IF pj[j].pc = "write" THEN locked \ {LockKey(pj[j].box, pj[j].d)} ELSE locked
  /\ UNCHANGED <<rowVars, wk, boxes, drives, reapQ, tdQ, sweepD, envVars, ghostVars,
                 sessions, mfail, envCh, bundleCh, wakes, aborts, sweeps, reprovs>>

\* ------------------------------------------------------------------ wake
WakeD == IF rowDrive # 0 THEN rowDrive ELSE IF WakeClaimFromEnv /\ envDrive THEN rowBox ELSE 0
WakeL == IF LaidColumn THEN rowLaid ELSE WakeD # 0

\* buildSandboxClaim from the row; then, under the box's resume lock (another holder:
\* "still starting"), Sandbox.get and, for a stopped box, waitForDriveDetached.
WakeStart(w) ==
  LET bx == boxes[rowBox]
      dd == IF rowDrive # 0 THEN rowDrive ELSE bx.next IN
  /\ wk[w].ph = "idle" /\ status = "awake" /\ bx.ex
  /\ ResumeLock => LockKey(rowBox, rowDrive) \notin locked
  /\ wakes < MaxWakes
  /\ wakes' = wakes + 1
  /\ bx.run \/ Detached(dd) \/ ~WaitDetach
  /\ locked' = IF ResumeLock THEN locked \cup {LockKey(rowBox, rowDrive)} ELSE locked
  /\ wk' = [wk EXCEPT ![w] = [ph |-> "waited", b |-> rowBox, d |-> rowDrive, cd |-> WakeD,
                               cl |-> WakeL, laid |-> rowLaid, run |-> bx.run]]
  /\ UNCHANGED <<rowVars, pj, boxes, drives, reapQ, tdQ, sweepD, envVars, ghostVars,
                 sessions, mfail, redeliveries, envCh, bundleCh, aborts, sweeps, reprovs>>

\* Still under the lock: a stopped box gets sandbox.update({ mounts }) (a failed drive
\* update throws), then writeIdentity and runBoot resume it. A box that was running
\* gets writeSignInFiles too, which resumes it if its session ended meanwhile.
WakeResume(w) ==
  LET W == wk[w]
      b == W.b
      d == W.d
      bx == boxes[b]
      next == IF d # 0 THEN d ELSE bx.next IN
  /\ W.ph = "waited" /\ bx.ex
  /\ locked' = locked \ {LockKey(b, d)}
  /\ IF ~W.run /\ d # 0 /\ ~drives[d].ex
       THEN /\ wk' = [wk EXCEPT ![w] = IdleWake]
            /\ UNCHANGED <<boxes, drives, rowDrive, doubleMount, mfail, sessions>>
       ELSE /\ wk' = [wk EXCEPT ![w].ph = "boot"]
            /\ rowDrive' = IF WakeWritesDrive /\ rowDrive = 0 /\ envDrive THEN rowBox ELSE rowDrive
            /\ IF bx.run
                 THEN UNCHANGED <<boxes, drives, doubleMount, mfail, sessions>>
                 ELSE IF W.run
                   THEN /\ (WaitDetach /\ FixRunningResume) => Detached(bx.next)
                        /\ Start(b, bx, bx.next, W.cd, W.cl)
                   ELSE Start(b, [bx EXCEPT !.next = next], next, W.cd, W.cl)
  /\ UNCHANGED <<status, rowBox, rowLaid, epoch, graceOver, pj, reapQ, tdQ, sweepD, envVars,
                 workVars, badDel, failedTransient, redeliveries, envCh, bundleCh, wakes,
                 aborts, sweeps, reprovs>>

\* settleSandbox; a refusal stops the box: retried ("still starting"), or, terminal,
\* markSandboxUnavailable fails the row. A settled wake records the layout.
WakeSettle(w) ==
  LET W == wk[w]
      b == W.b
      bx == boxes[b] IN
  /\ W.ph = "boot" /\ bx.ex
  /\ ~Booting(bx)
  /\ wk' = [wk EXCEPT ![w] = IdleWake]
  /\ IF SettleOK(bx, W.cd)
       THEN /\ boxes' = [boxes EXCEPT ![b].ok = TRUE]
            /\ rowLaid' = (rowLaid \/ (LaidColumn /\ W.d # 0 /\ ~W.laid))
            /\ UNCHANGED status
       ELSE /\ boxes' = IF Refused(bx, W.cd) /\ (ResumeLock => LockKey(b, W.d) \notin locked)
                           THEN StopIn(boxes, b) ELSE boxes
            /\ status' = IF Refused(bx, W.cd) /\ Terminal(bx) /\ status = "awake"
                           THEN "failed" ELSE status
            /\ UNCHANGED rowLaid
  /\ UNCHANGED <<rowBox, rowDrive, epoch, graceOver, pj, drives, reapQ, tdQ, sweepD, envVars,
                 ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

WakeDie(w) ==
  /\ wk[w].ph # "idle"
  /\ wk' = [wk EXCEPT ![w] = IdleWake]
  /\ locked' = IF wk[w].ph = "waited" THEN locked \ {LockKey(wk[w].b, wk[w].d)} ELSE locked
  /\ UNCHANGED <<rowVars, pj, boxes, drives, reapQ, tdQ, sweepD, envVars, ghostVars, budgetVars,
                 reprovs>>

\* markSandboxUnavailable: the box is gone, the row is failed.
WakeUnavailable ==
  /\ status = "awake" /\ ~boxes[rowBox].ex
  /\ status' = "failed"
  /\ UNCHANGED <<rowBox, rowDrive, rowLaid, epoch, graceOver, pj, wk, boxes, drives, reapQ,
                 tdQ, sweepD, envVars, ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* ------------------------------------------------- archive, reap, unarchive
Archive ==
  /\ status \in {"provisioning", "awake", "failed"} /\ epoch < MaxArchives
  /\ status' = "archived" /\ epoch' = epoch + 1 /\ graceOver' = FALSE
  /\ reapQ' = reapQ \cup {[e |-> epoch + 1, stage |-> "stop"], [e |-> epoch + 1, stage |-> "delete"]}
  /\ boxes' = [boxes EXCEPT ![rowBox].ok = FALSE]
  /\ UNCHANGED <<rowBox, rowDrive, rowLaid, pj, wk, drives, tdQ, sweepD, envVars,
                 ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* Seven days pass: the user's deletion is due; their work may now go.
GraceEnds ==
  /\ status = "archived" /\ ~graceOver
  /\ ProvIdle /\ \A w \in Wakers : wk[w].ph = "idle"
  /\ graceOver' = TRUE /\ hasWork' = FALSE
  /\ UNCHANGED <<status, rowBox, rowDrive, rowLaid, epoch, pj, wk, boxes, drives, reapQ, tdQ,
                 sweepD, envVars, workDrive, workBox, doubleMount, badDel, failedTransient,
                 budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* The stop stage after a minute; the delete stage after the grace, which retires the
\* row's names in the write that checks the archive (retireAndTearDown), then queues
\* the teardown of the old ones.
ReapRun(j) ==
  /\ j \in reapQ
  /\ reapQ' = reapQ \ {j}
  /\ j.stage = "delete" => (j.e # epoch \/ graceOver)
  /\ LET legit == status = "archived" /\ j.e = epoch
         runs == legit \/ ~ReapChecksEpoch IN
     IF ~runs THEN UNCHANGED <<boxes, tdQ, badDel, rowBox, rowDrive, rowLaid>>
     ELSE IF j.stage = "stop"
       THEN /\ boxes' = StopIn(boxes, rowBox)
            /\ UNCHANGED <<tdQ, badDel, rowBox, rowDrive, rowLaid>>
       ELSE IF RetireNames
         THEN IF legit
                THEN /\ rowBox' = 0 /\ rowDrive' = 0 /\ rowLaid' = FALSE
                     /\ tdQ' = IF rowDrive # 0 THEN tdQ \cup {TdJob(rowBox, rowDrive, "archived")} ELSE tdQ
                     /\ boxes' = IF rowDrive # 0 THEN boxes ELSE [boxes EXCEPT ![rowBox] = NoBox]
                     /\ UNCHANGED badDel
                ELSE UNCHANGED <<boxes, tdQ, badDel, rowBox, rowDrive, rowLaid>>
         ELSE /\ TearDown(rowBox, rowDrive, "archived")
              /\ UNCHANGED <<rowBox, rowDrive, rowLaid>>
  /\ UNCHANGED <<status, epoch, graceOver, pj, wk, drives, sweepD, envVars,
                 workVars, doubleMount, failedTransient, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* Resumable while the old box exists; otherwise a new box name, the drive name kept,
\* and a new provision job.
Unarchive ==
  /\ status = "archived"
  /\ IF rowBox # 0 /\ boxes[rowBox].ex
       THEN /\ status' = "awake"
            /\ UNCHANGED <<rowBox, pj, reprovs>>
       ELSE /\ rowBox # 2 /\ reprovs = 0 /\ ~boxes[2].ex
            /\ FixOneProvision => ProvIdle
            /\ \E j \in ProvJobs :
                 /\ pj[j].pc = "none"
                 /\ pj' = [pj EXCEPT ![j] = [IdleJob EXCEPT !.pc = "claim"]]
            /\ status' = "provisioning" /\ rowBox' = 2 /\ reprovs' = 1
  /\ graceOver' = FALSE
  /\ UNCHANGED <<rowDrive, rowLaid, epoch, wk, boxes, drives, reapQ, tdQ, sweepD, envVars,
                 ghostVars, budgetVars>>
  /\ UNCHANGED locked

\* teardownSandbox: [check rows, stop] [wait detach, check rows] [delete box]
\* [check rows] [delete drive]. Keyed on names; any failure requeues from the top.
Done(j) == tdQ' = tdQ \ {j}
\* liveReferences: a row not archived or failed keeps what it names.
KeepBox(j) == TeardownChecksRows /\ IF GuardAnyRow THEN rowBox = j.b ELSE LiveBox(j.b)
KeepDrive(j) == TeardownChecksRows /\ IF GuardAnyRow THEN j.d # 0 /\ rowDrive = j.d ELSE LiveDrive(j.d)
Phase(j, ph) == tdQ' = (tdQ \ {j}) \cup {[j EXCEPT !.ph = ph]}
TdRun(j) ==
  /\ j \in tdQ
  /\ CASE j.ph = "check" ->
          IF KeepBox(j)
            THEN Done(j) /\ UNCHANGED <<boxes, drives, badDel, redeliveries>>
            ELSE /\ boxes' = StopIn(boxes, j.b) /\ Phase(j, "wait")
                 /\ UNCHANGED <<drives, badDel, redeliveries>>
       [] j.ph = "wait" ->
          /\ Detached(j.d)
          /\ IF KeepBox(j)
               THEN Done(j)
               ELSE tdQ' = (tdQ \ {j}) \cup {[j EXCEPT !.ph = "delbox", !.ld = j.ld \/ KeepDrive(j)]}
          /\ UNCHANGED <<boxes, drives, badDel, redeliveries>>
       [] j.ph = "delbox" ->
          /\ boxes' = [boxes EXCEPT ![j.b] = NoBox]
          /\ badDel' = (badDel \/ (boxes[j.b].ex /\ LiveBox(j.b)))
          /\ IF j.ld THEN Done(j) ELSE Phase(j, "chk2")
          /\ UNCHANGED <<drives, redeliveries>>
       [] j.ph = "chk2" ->
          /\ IF KeepDrive(j) THEN Done(j) ELSE Phase(j, "deldrive")
          /\ UNCHANGED <<boxes, drives, badDel, redeliveries>>
       [] j.ph = "deldrive" ->
          /\ IF ~Detached(j.d)
               THEN /\ redeliveries < MaxRedeliveries /\ redeliveries' = redeliveries + 1
                    /\ Phase(j, "check")
                    /\ UNCHANGED <<boxes, drives, badDel>>
               ELSE /\ drives' = [drives EXCEPT ![j.d] = NoDrive]
                    /\ badDel' = (badDel \/ (drives[j.d].ex /\ LiveDrive(j.d)))
                    /\ \E dup \in (IF redeliveries < MaxRedeliveries THEN BOOLEAN ELSE {FALSE}) :
                         /\ IF dup THEN Phase(j, "check") ELSE Done(j)
                         /\ redeliveries' = IF dup THEN redeliveries + 1 ELSE redeliveries
                    /\ UNCHANGED boxes
  /\ UNCHANGED <<rowVars, pj, wk, reapQ, sweepD, envVars, workVars, doubleMount,
                 failedTransient, sessions, mfail, envCh, bundleCh, wakes, aborts, sweeps>>
  /\ UNCHANGED <<locked, reprovs>>

\* After TEARDOWN_ATTEMPTS with the drive still attached the job gives up.
TdAbandon(j) ==
  /\ j \in tdQ /\ j.ph = "wait" /\ ~Detached(j.d)
  /\ Done(j)
  /\ UNCHANGED <<rowVars, pj, wk, boxes, drives, reapQ, sweepD, envVars, ghostVars, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* drive-sweep: a drive no row owns (a row archived past its grace owns nothing),
\* not attached when listed; deleted later from that list.
Owned(d) == rowDrive = d /\ (FixSweepNamed \/ ~(status = "archived" /\ graceOver))
InFlight(d) == (\E j \in tdQ : j.d = d) \/ (\E j \in ProvJobs : pj[j].pc # "none" /\ pj[j].d = d)
Orphan(d) == drives[d].ex /\ ~Owned(d) /\ ~InFlight(d)

SweepList(d) ==
  /\ SweepRuns /\ sweepD = 0 /\ sweeps < MaxSweeps
  /\ drives[d].ex /\ drives[d].att = 0 /\ ~Owned(d)
  /\ sweepD' = d /\ sweeps' = sweeps + 1
  /\ UNCHANGED <<rowVars, pj, wk, boxes, drives, reapQ, tdQ, envVars, ghostVars,
                 sessions, mfail, redeliveries, envCh, bundleCh, wakes, aborts>>
  /\ UNCHANGED <<locked, reprovs>>

SweepDelete ==
  /\ sweepD # 0
  /\ sweepD' = 0
  /\ IF drives[sweepD].ex /\ drives[sweepD].att = 0
       THEN /\ drives' = [drives EXCEPT ![sweepD] = NoDrive]
            /\ badDel' = (badDel \/ LiveDrive(sweepD))
       ELSE UNCHANGED <<drives, badDel>>
  /\ UNCHANGED <<rowVars, pj, wk, boxes, reapQ, tdQ, envVars, workVars, doubleMount,
                 failedTransient, budgetVars>>
  /\ UNCHANGED <<locked, reprovs>>

\* ----------------------------------------------------------- environment
NewGoldenDrive ==
  /\ envCh < MaxEnvChanges /\ envCh' = envCh + 1
  /\ envDrive' = TRUE
  /\ gOwn' = IF StripIdentity THEN "none" ELSE "other"
  /\ gBr' \in BOOLEAN
  /\ UNCHANGED <<rowVars, pj, wk, boxes, drives, reapQ, tdQ, sweepD, bundle, ghostVars,
                 sessions, mfail, redeliveries, bundleCh, wakes, aborts, sweeps>>
  /\ UNCHANGED <<locked, reprovs>>

\* A release or promote leaving drive mode, or the drives flag turned off.
LeaveDriveMode ==
  /\ envDrive /\ envCh < MaxEnvChanges /\ envCh' = envCh + 1
  /\ envDrive' = FALSE
  /\ UNCHANGED <<rowVars, pj, wk, boxes, drives, reapQ, tdQ, sweepD, gOwn, gBr, bundle,
                 ghostVars, sessions, mfail, redeliveries, bundleCh, wakes, aborts, sweeps>>
  /\ UNCHANGED <<locked, reprovs>>

BundleChange ==
  /\ bundleCh < MaxBundleChanges /\ bundleCh' = bundleCh + 1
  /\ bundle' = IF bundle = "aware" THEN "old" ELSE "aware"
  /\ UNCHANGED <<rowVars, pj, wk, boxes, drives, reapQ, tdQ, sweepD, envDrive, gOwn, gBr,
                 ghostVars, sessions, mfail, redeliveries, envCh, wakes, aborts, sweeps>>
  /\ UNCHANGED <<locked, reprovs>>

Next ==
  \/ \E j \in ProvJobs : ProvClaim(j) \/ ProvFork(j) \/ ProvCreate(j) \/ ProvWrite(j)
                         \/ ProvError(j) \/ ProvMark(j) \/ ProvSettle(j) \/ ProvDie(j)
  \/ \E w \in Wakers : WakeStart(w) \/ WakeResume(w) \/ WakeSettle(w) \/ WakeDie(w)
  \/ WakeUnavailable
  \/ \E b \in Boxes : Boot1(b) \/ Boot2(b) \/ SessionEnds(b) \/ Abort(b)
  \/ \E d \in DriveIds : Detach(d) \/ SweepList(d)
  \/ SweepDelete
  \/ UserWork
  \/ Archive \/ GraceEnds \/ Unarchive
  \/ \E j \in reapQ : ReapRun(j)
  \/ \E j \in tdQ : TdRun(j) \/ TdAbandon(j)
  \/ NewGoldenDrive \/ LeaveDriveMode \/ BundleChange

Spec == Init /\ [][Next]_vars

WakerSymmetry == Permutations(Wakers)

Bound == sessions <= MaxSessions

\* ------------------------------------------------------------------ rules
NoWorkLost ==
  hasWork =>
    /\ workDrive # 0 => drives[workDrive].ex /\ drives[workDrive].con = "work"
    /\ workBox # 0 => boxes[workBox].ex /\ boxes[workBox].rw

NeverEmptyShownAsWork ==
  LET bx == boxes[rowBox] IN
  (status = "awake" /\ bx.ok) =>
    /\ bx.run
    /\ rowDrive # 0 => bx.bound /\ bx.mount = rowDrive /\ drives[rowDrive].own = "self"
    /\ (hasWork /\ workDrive # 0) => bx.bound /\ bx.mount = workDrive
    /\ (hasWork /\ workBox # 0) => workBox = rowBox

SingleWriter == ~doubleMount

NoTeardownOfLive == ~badDel

DriveOnlyByProvision ==
  [][(rowDrive = 0 /\ rowDrive' # 0) => \E j \in ProvJobs : ProvClaim(j)]_vars

NoDriveUnchanged ==
  rowDrive = 0 => LET bx == boxes[rowBox] IN
    bx.ex => (bx.mount = 0 /\ bx.next = 0 /\ bx.cD = 0 /\ ~bx.bound)

\* A live row whose every future wake fails without ever reaching the terminal
\* state: its drive is gone (the mount update throws), or a persistent refusal
\* with no terminal path.
Stuck ==
  /\ status = "awake" /\ rowDrive # 0 /\ ProvIdle /\ boxes[rowBox].ex
  /\ ~(boxes[rowBox].run /\ ~boxes[rowBox].cL)
  /\ \/ ~drives[rowDrive].ex
     \/ ~RefusalLimitOn /\ (drives[rowDrive].own = "other" \/ (drives[rowDrive].own = "none" /\ WakeL))
NoStuckForever == ~Stuck

FreshForkIsFetched == \A d \in DriveIds : drives[d].con # "stale"

TransientIsRetried == ~failedTransient

NoOrphanForever == \A d \in DriveIds : Orphan(d) => SweepRuns

=============================================================================
