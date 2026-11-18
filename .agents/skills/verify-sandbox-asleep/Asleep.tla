---------------------------- MODULE Asleep ----------------------------
(* One cloud workspace row, its Vercel box, and every writer of status.  *)
(* Time is a small integer clock; a session lasts Timeout ticks.         *)
EXTENDS Integers, FiniteSets

CONSTANTS MaxT, Timeout, CAS, MaxGen

VARIABLES
  status,      \* cloud_workspaces.status
  expiresAt,   \* cloud_workspaces.sandbox_expires_at, or -1 for never observed
  now,         \* the clock
  box,         \* Vercel's truth: "none" | "running" | "stopped"
  boxExpires,  \* Vercel's real session end while running
  watch,       \* QStash messages: set of fire times (delivery may be late or duplicated)
  inflight,    \* writers between their Vercel call and their DB write
  snap,        \* the reconcile's listing: "none" | "running" | "stopped"
  closed,      \* how many times the open boot row was closed
  stopSeen,    \* the session id our stop read before it stopped the box (for a compare-and-set)
  gen,         \* Vercel's current session id: a new one per resume
  snapGen      \* the session id the reconcile's listing carried

vars == <<status, expiresAt, now, box, boxExpires, watch, inflight, snap, closed, stopSeen, gen, snapGen>>

Live == status \in {"awake", "asleep"}

Init ==
  /\ status = "provisioning" /\ expiresAt = -1 /\ now = 0
  /\ box = "none" /\ boxExpires = 0 /\ watch = {} /\ inflight = {}
  /\ snap = "none" /\ closed = 0 /\ stopSeen = -1 /\ gen = 0 /\ snapGen = 0

\* --- time, and things Vercel does on its own -------------------------
Tick ==
  /\ now < MaxT
  /\ now' = now + 1
  /\ IF box = "running" /\ now + 1 >= boxExpires THEN box' = "stopped" ELSE UNCHANGED box
  /\ UNCHANGED <<status, expiresAt, boxExpires, watch, inflight, snap, closed, stopSeen, gen, snapGen>>

Crash ==
  /\ box = "running"
  /\ box' = "stopped"
  /\ UNCHANGED <<status, expiresAt, now, boxExpires, watch, inflight, snap, closed, stopSeen, gen, snapGen>>

\* --- provision: the box comes up, then the row is marked awake --------
ProvisionDone ==
  /\ status = "provisioning" /\ box = "none"
  /\ box' = "running" /\ boxExpires' = now + Timeout /\ gen' = gen + 1
  /\ status' = "awake" /\ expiresAt' = now + Timeout /\ closed' = 0
  /\ watch' = watch \cup {now + Timeout}
  /\ UNCHANGED <<now, inflight, snap, stopSeen, snapGen>>

\* --- wake: resume on Vercel, then recordSandboxAwake ------------------
WakeResume ==
  /\ Live /\ box = "stopped" /\ "wake" \notin inflight
  /\ box' = "running" /\ boxExpires' = now + Timeout /\ gen' = gen + 1 /\ closed' = 0
  /\ inflight' = inflight \cup {"wake"}
  /\ UNCHANGED <<status, expiresAt, now, watch, snap, stopSeen, snapGen>>

WakeRecord ==
  /\ "wake" \in inflight
  /\ inflight' = inflight \ {"wake"}
  /\ IF Live THEN
       /\ status' = "awake" /\ expiresAt' = boxExpires
       /\ watch' = watch \cup {boxExpires}
     ELSE UNCHANGED <<status, expiresAt, watch>>   \* archived meanwhile: the guard refuses
  /\ UNCHANGED <<now, box, boxExpires, snap, closed, stopSeen, gen, snapGen>>

\* --- keepalive top-up: extend on Vercel, then write the new expiry ----
TopUpExtend ==
  /\ status = "awake" /\ box = "running" /\ "topup" \notin inflight
  /\ boxExpires' = now + Timeout
  /\ inflight' = inflight \cup {"topup"}
  /\ UNCHANGED <<status, expiresAt, now, box, watch, snap, closed, stopSeen, gen, snapGen>>

TopUpRecord ==
  /\ "topup" \in inflight
  /\ inflight' = inflight \ {"topup"}
  /\ IF Live THEN expiresAt' = boxExpires ELSE UNCHANGED expiresAt
  /\ UNCHANGED <<status, now, box, boxExpires, watch, snap, closed, stopSeen, gen, snapGen>>

\* --- our own stop (sleep, restart, spend cap): stop, then record ------
StopBox ==
  /\ status = "awake" /\ box = "running" /\ "stop" \notin inflight
  /\ box' = "stopped"
  /\ inflight' = inflight \cup {"stop"}
  /\ stopSeen' = gen
  /\ UNCHANGED <<status, expiresAt, now, boxExpires, watch, snap, closed, gen, snapGen>>

StopRecord ==
  /\ "stop" \in inflight
  /\ inflight' = inflight \ {"stop"}
  /\ IF status = "awake" /\ (~CAS \/ gen = stopSeen)   \* CAS: only if no new session started since
       THEN status' = "asleep" /\ expiresAt' = now /\ closed' = closed + 1
       ELSE UNCHANGED <<status, expiresAt, closed>>
  /\ UNCHANGED <<now, box, boxExpires, watch, snap, stopSeen, gen, snapGen>>

\* --- the expiry watch: fires at or after its time, maybe twice --------
WatchFire ==
  \E t \in watch : \E keep \in BOOLEAN :      \* keep = the message is delivered again later
    LET base == IF keep THEN watch ELSE watch \ {t} IN
    /\ t <= now
    /\ CASE expiresAt > now ->      \* extended since: requeue, no Vercel call
            /\ watch' = base \cup {expiresAt}
            /\ UNCHANGED <<status, expiresAt, closed>>
         [] box = "running" ->                               \* Sandbox.get says still up
            /\ expiresAt' = boxExpires
            /\ watch' = base \cup {boxExpires}
            /\ UNCHANGED <<status, closed>>
         [] OTHER ->                                         \* confirmed stopped
            /\ watch' = base
            /\ IF status = "awake" THEN status' = "asleep" /\ closed' = closed + 1
               ELSE UNCHANGED <<status, closed>>
            /\ UNCHANGED expiresAt
    /\ UNCHANGED <<now, box, boxExpires, inflight, snap, stopSeen, gen, snapGen>>

\* --- the 30-min reconcile: list (a snapshot), then act on it ----------
ReconcileList ==
  /\ snap = "none" /\ box /= "none"
  /\ snap' = box /\ snapGen' = gen
  /\ UNCHANGED <<status, expiresAt, now, box, boxExpires, watch, inflight, closed, stopSeen, gen>>

ReconcileApply ==
  /\ snap /= "none"
  /\ snap' = "none"
  /\ IF snap = "stopped" /\ status = "awake" /\ (~CAS \/ gen = snapGen) THEN status' = "asleep" /\ closed' = closed + 1
     ELSE UNCHANGED <<status, closed>>
  /\ UNCHANGED <<expiresAt, now, box, boxExpires, watch, inflight, stopSeen, gen, snapGen>>

\* --- archive, then the reap --------------------------------------------
Archive ==
  /\ status \in {"provisioning", "awake", "asleep", "failed"}
  /\ status' = "archived"
  /\ UNCHANGED <<expiresAt, now, box, boxExpires, watch, inflight, snap, closed, stopSeen, gen, snapGen>>

Reap ==
  /\ status = "archived" /\ box = "running"
  /\ box' = "stopped"
  /\ UNCHANGED <<status, expiresAt, now, boxExpires, watch, inflight, snap, closed, stopSeen, gen, snapGen>>

Done == now = MaxT /\ UNCHANGED vars

Next ==
  \/ Tick \/ Crash \/ ProvisionDone
  \/ WakeResume \/ WakeRecord \/ TopUpExtend \/ TopUpRecord
  \/ StopBox \/ StopRecord \/ WatchFire
  \/ ReconcileList \/ ReconcileApply \/ Archive \/ Reap \/ Done

Spec == Init /\ [][Next]_vars

\* Bound: at most MaxGen sessions per run of the model; wakes do not advance the clock.
Bound == gen <= MaxGen /\ closed <= 2 /\ Cardinality(watch) <= 3

\* --- the rules ----------------------------------------------------------
\* A row never says asleep while its box runs, unless a wake is mid-flight.
NeverAsleepWhileRunning ==
  (status = "asleep" /\ box = "running") => "wake" \in inflight

\* A boot row is closed at most once.
ClosedOnce == closed <= 1

\* The row is awake only if its box is running or a stop is still being recorded.
AwakeMeansRunning ==
  (status = "awake" /\ box = "stopped") =>
    \/ "stop" \in inflight
    \/ watch /= {}            \* the watch will catch it
    \/ snap /= "none"         \* or the reconcile is mid-sweep

=============================================================================
