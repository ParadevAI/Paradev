---------------------------- MODULE Lifecycle ----------------------------
(* The end-state lifecycle rules for every cloud sandbox resource: the     *)
(* rule set, not today's code.  One Vercel project, two databases: PROD    *)
(* and PREVIEW, a copy of PROD that drifts.  Time is abstract days; the    *)
(* waits are constants, scaled in the configs.                             *)
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
  WS, Ops,
  Expire, Grace, FailKeep, ProvStuck, LeftoverAge,
  KeepGoldens, MaxGoldens, MaxReleases,
  DeleteFromPreview,
  Overlay, PinCheck, CleanupPrunesPinned,
  RetireFirst, TeardownRetries, FailTearsDown, VercelExpiry,
  Rule1On, Rule2On, Rule3On, GraceOn, LeftoverBoxesOnly

DBs == {"PROD", "PREVIEW"}
None == <<>>
WsNames == DBs \X WS
GNames == DBs \X (1..MaxGoldens)
Res == ({"box", "drive"} \X WsNames) \cup ({"golden"} \X GNames) \cup ({"agents"} \X (1..MaxReleases))
Box(n) == <<"box", n>>
Drive(n) == <<"drive", n>>
Golden(g) == <<"golden", g>>
Agents(a) == <<"agents", a>>
Aging(r) == r[1] \in {"box", "drive", "golden"}
Min(a, b) == IF a < b THEN a ELSE b
Range(s) == {s[i] : i \in DOMAIN s}

NoRow == [st |-> "none", n |-> None, pin |-> None, t |-> 0, half |-> FALSE]
GoneRow == [NoRow EXCEPT !.st = "gone"]
NoEnv == [st |-> "none", gs |-> <<>>, act |-> None, prune |-> FALSE]

VARIABLES
  rows,      \* rows[d][w]: st, n (box and drive name; None once retired), pin, t (days in st), half
  env,       \* env[d]: st, gs (goldens, newest last), act (active golden), prune (a build's prune is due)
  gcnt,      \* goldens built in database d
  rel,       \* production's current release; its agents drive is Agents(rel)
  ex,        \* ex[r]: the resource exists in Vercel
  age,       \* age[r]: days since created, capped at LeftoverAge
  mnt,       \* mnt[box]: the agents drive the box mounts
  tdQ,       \* queued teardowns <<d, n>>
  branched,  \* PREVIEW has been copied from PROD
  iso        \* ghost: PREVIEW has deleted nothing

vars == <<rows, env, gcnt, rel, ex, age, mnt, tdQ, branched, iso>>
resVars == <<ex, age, mnt, iso>>

Active(d) == d = "PROD" \/ branched
\* Only production deletes: with PREVIEW a delete logs "would delete" and stops.
CanDelete(d) == d = "PROD" \/ DeleteFromPreview
\* The cleanup job runs only in production.
JobRuns(d) == Active(d) /\ CanDelete(d)
Live(d, w) == rows[d][w].st \notin {"none", "gone"}
NamesWs(d, w, n) == Live(d, w) /\ rows[d][w].n = n
PinnedIn(d, g) == \E w \in WS : Live(d, w) /\ rows[d][w].pin = g
PinGuard(d, g) == ~(Overlay /\ PinCheck /\ PinnedIn(d, g))
NewestK(d) == LET s == env[d].gs IN {s[i] : i \in {j \in DOMAIN s : j > Len(s) - KeepGoldens}}
BeyondK(d) == {g \in Range(env[d].gs) : g \notin NewestK(d) /\ g # env[d].act}

Cap(r) == IF r.n = None THEN 0
          ELSE CASE r.st = "provisioning" -> ProvStuck
                 [] r.st = "asleep"       -> Expire
                 [] r.st = "archived"     -> Grace
                 [] r.st = "failed"       -> FailKeep
                 [] OTHER                 -> 0

\* Rule 1's wait is over.
Due(d, w) ==
  LET r == rows[d][w] IN
  /\ Live(d, w) /\ r.n # None
  /\ \/ r.st = "asleep" /\ r.t >= Expire
     \/ r.st = "archived" /\ r.t >= Grace
     \/ r.st = "failed" /\ r.t >= FailKeep
     \/ r.st = "provisioning" /\ r.t >= ProvStuck

DueImpl(d, w) ==
  LET r == rows[d][w] IN
  /\ Rule1On /\ Live(d, w) /\ r.n # None
  /\ \/ r.st = "asleep" /\ r.t >= Expire
     \/ r.st = "archived" /\ r.t >= (IF GraceOn THEN Grace ELSE 0)
     \/ r.st = "failed" /\ r.t >= FailKeep
     \/ r.st = "provisioning" /\ r.t >= ProvStuck

\* The one check inside the delete functions.
DelBy(S, d) ==
  IF CanDelete(d)
  THEN /\ ex' = [r \in Res |-> IF r \in S THEN FALSE ELSE ex[r]]
       /\ age' = [r \in Res |-> IF r \in S THEN 0 ELSE age[r]]
       /\ mnt' = [r \in Res |-> IF r \in S THEN None ELSE mnt[r]]
       /\ iso' = (iso /\ (d = "PROD" \/ \A r \in S : ~ex[r]))
  ELSE UNCHANGED resVars

Init ==
  /\ rows = [d \in DBs |-> [w \in WS |-> NoRow]]
  /\ env = [d \in DBs |-> IF d = "PROD"
                          THEN [st |-> "live", gs |-> <<<<"PROD", 1>>>>, act |-> <<"PROD", 1>>, prune |-> FALSE]
                          ELSE NoEnv]
  /\ gcnt = [d \in DBs |-> IF d = "PROD" THEN 1 ELSE 0]
  /\ rel = 1
  /\ ex = [r \in Res |-> r \in {Golden(<<"PROD", 1>>), Agents(1)}]
  /\ age = [r \in Res |-> 0]
  /\ mnt = [r \in Res |-> None]
  /\ tdQ = {}
  /\ branched = FALSE
  /\ iso = TRUE

-----------------------------------------------------------------------------
Tick ==
  LET rows2 == [d \in DBs |-> [w \in WS |->
                  [rows[d][w] EXCEPT !.t = Min(@ + 1, Cap(rows[d][w]))]]]
      age2 == [r \in Res |-> IF ex[r] /\ Aging(r) THEN Min(age[r] + 1, LeftoverAge) ELSE age[r]]
  IN /\ <<rows2, age2>> # <<rows, age>>
     /\ rows' = rows2 /\ age' = age2
     /\ UNCHANGED <<env, gcnt, rel, ex, mnt, tdQ, branched, iso>>

\* PREVIEW is a copy of PROD, taken at any time.  Queued jobs are not copied.
Branch ==
  /\ "branch" \in Ops /\ ~branched
  /\ branched' = TRUE
  /\ rows' = [rows EXCEPT !["PREVIEW"] = rows["PROD"]]
  /\ env' = [env EXCEPT !["PREVIEW"] = [env["PROD"] EXCEPT !.prune = FALSE]]
  /\ UNCHANGED <<gcnt, rel, ex, age, mnt, tdQ, iso>>

-----------------------------------------------------------------------------
(* User actions: they create, or set a status.  They delete nothing.       *)
SetRow(d, w, st) == rows' = [rows EXCEPT ![d][w].st = st, ![d][w].t = 0]

Create(d, w) ==
  /\ Active(d) /\ rows[d][w].st = "none" /\ env[d].st = "live"
  /\ LET n == <<d, w>> IN
     /\ rows' = [rows EXCEPT ![d][w] =
                  [st |-> "provisioning", n |-> n, t |-> 0, half |-> FALSE,
                   pin |-> IF Overlay THEN env[d].act ELSE None]]
     /\ ex' = [ex EXCEPT ![Box(n)] = TRUE, ![Drive(n)] = TRUE]
     /\ age' = [age EXCEPT ![Box(n)] = 0, ![Drive(n)] = 0]
     /\ mnt' = [mnt EXCEPT ![Box(n)] = rel]
  /\ UNCHANGED <<env, gcnt, rel, tdQ, branched, iso>>

\* A boot or a wake mounts the current release's agents drive.
BootOrWake(d, w, from) ==
  /\ rows[d][w].st = from /\ rows[d][w].n # None /\ ~rows[d][w].half
  /\ ex[Box(rows[d][w].n)]
  /\ SetRow(d, w, "awake")
  /\ mnt' = [mnt EXCEPT ![Box(rows[d][w].n)] = rel]
  /\ UNCHANGED <<env, gcnt, rel, ex, age, tdQ, branched, iso>>

Boot(d, w) == BootOrWake(d, w, "provisioning")
Wake(d, w) == BootOrWake(d, w, "asleep")

Move(d, w, from, to) ==
  /\ rows[d][w].st \in from /\ rows[d][w].n # None /\ ~rows[d][w].half
  /\ SetRow(d, w, to)
  /\ UNCHANGED <<env, gcnt, rel, ex, age, mnt, tdQ, branched, iso>>

\* A stop replaces the box's previous snapshot; that is not a deletion.
Sleep(d, w) == Move(d, w, {"awake"}, "asleep")
Archive(d, w) == Move(d, w, {"awake", "asleep"}, "archived")
Unarchive(d, w) == Move(d, w, {"archived"}, "asleep")

RetiredRow(r) ==
  [r EXCEPT !.st = IF @ = "archived" THEN "archived" ELSE "failed",
            !.n = None, !.pin = None, !.t = 0, !.half = FALSE]

\* A failed create or a 410 on wake only sets a status.  FailTearsDown: it
\* tears down at once instead.
Fail(d, w) ==
  /\ rows[d][w].st \in {"provisioning", "awake", "asleep"} /\ rows[d][w].n # None /\ ~rows[d][w].half
  /\ IF FailTearsDown
     THEN /\ rows' = [rows EXCEPT ![d][w] = RetiredRow([@ EXCEPT !.st = "failed"])]
          /\ tdQ' = tdQ \cup {<<d, rows[d][w].n>>}
     ELSE /\ SetRow(d, w, "failed")
          /\ UNCHANGED tdQ
  /\ UNCHANGED <<env, gcnt, rel, ex, age, mnt, branched, iso>>

\* The daily purge deletes an organization's rows; its resources stay.
OrgDelete(d) ==
  /\ "org" \in Ops /\ Active(d) /\ env[d].st # "gone"
  /\ rows' = [rows EXCEPT ![d] = [w \in WS |-> GoneRow]]
  /\ env' = [env EXCEPT ![d] = [NoEnv EXCEPT !.st = "gone"]]
  /\ UNCHANGED <<gcnt, rel, ex, age, mnt, tdQ, branched, iso>>

EnvArchive(d) ==
  /\ "envarchive" \in Ops /\ Active(d) /\ env[d].st = "live"
  /\ env' = [env EXCEPT ![d].st = "archived", ![d].prune = FALSE]
  /\ UNCHANGED <<rows, gcnt, rel, ex, age, mnt, tdQ, branched, iso>>

\* Rule 2: a build or a promote makes a golden, swaps it in, then prunes.
Build(d) ==
  /\ "build" \in Ops /\ Active(d) /\ env[d].st = "live" /\ gcnt[d] < MaxGoldens
  /\ LET g == <<d, gcnt[d] + 1>> IN
     /\ env' = [env EXCEPT ![d].gs = Append(@, g), ![d].act = g, ![d].prune = TRUE]
     /\ ex' = [ex EXCEPT ![Golden(g)] = TRUE]
     /\ age' = [age EXCEPT ![Golden(g)] = 0]
  /\ gcnt' = [gcnt EXCEPT ![d] = @ + 1]
  /\ UNCHANGED <<rows, rel, mnt, tdQ, branched, iso>>

DropGoldens(d, S) ==
  env' = [env EXCEPT ![d].gs = SelectSeq(@, LAMBDA x : x \notin S), ![d].prune = FALSE]

BuildPrune(d) ==
  /\ Active(d) /\ env[d].st = "live" /\ env[d].prune
  /\ LET S == IF Rule2On THEN {g \in BeyondK(d) : PinGuard(d, g)} ELSE {} IN
     /\ DelBy({Golden(g) : g \in S}, d)
     /\ IF CanDelete(d) THEN DropGoldens(d, S) ELSE env' = [env EXCEPT ![d].prune = FALSE]
  /\ UNCHANGED <<rows, gcnt, rel, tdQ, branched>>

\* Releases come from main only.
Release ==
  /\ "release" \in Ops /\ rel < MaxReleases
  /\ rel' = rel + 1
  /\ ex' = [ex EXCEPT ![Agents(rel + 1)] = TRUE]
  /\ UNCHANGED <<rows, env, gcnt, age, mnt, tdQ, branched, iso>>

VercelExpire(b) ==
  /\ VercelExpiry /\ b[1] = "box" /\ ex[b]
  /\ \E d \in DBs, w \in WS :
       NamesWs(d, w, b[2]) /\ rows[d][w].st = "asleep" /\ rows[d][w].t >= Expire
  /\ ex' = [ex EXCEPT ![b] = FALSE]
  /\ age' = [age EXCEPT ![b] = 0]
  /\ mnt' = [mnt EXCEPT ![b] = None]
  /\ UNCHANGED <<rows, env, gcnt, rel, tdQ, branched, iso>>

-----------------------------------------------------------------------------
(* The cleanup job, against database d.                                     *)

\* Rule 1 through teardown(row): retire the row (one conditional write that
\* clears its names and queues the job), then delete box and drive together.
\* RetireFirst = FALSE deletes the drive before the retire.
Retire(d, w) ==
  /\ JobRuns(d) /\ DueImpl(d, w) /\ ~rows[d][w].half
  /\ IF RetireFirst
     THEN /\ rows' = [rows EXCEPT ![d][w] = RetiredRow(@)]
          /\ tdQ' = tdQ \cup {<<d, rows[d][w].n>>}
          /\ UNCHANGED resVars
     ELSE /\ DelBy({Drive(rows[d][w].n)}, d)
          /\ rows' = [rows EXCEPT ![d][w].half = TRUE]
          /\ UNCHANGED tdQ
  /\ UNCHANGED <<env, gcnt, rel, branched>>

RetireHalf(d, w) ==
  /\ Live(d, w) /\ rows[d][w].half
  /\ rows' = [rows EXCEPT ![d][w] = RetiredRow(@)]
  /\ tdQ' = tdQ \cup {<<d, rows[d][w].n>>}
  /\ UNCHANGED <<env, gcnt, rel, ex, age, mnt, branched, iso>>

TdRun(j) ==
  /\ j \in tdQ
  /\ DelBy({Box(j[2]), Drive(j[2])}, j[1])
  /\ tdQ' = tdQ \ {j}
  /\ UNCHANGED <<rows, env, gcnt, rel, branched>>

TdGiveUp(j) ==
  /\ ~TeardownRetries /\ j \in tdQ
  /\ tdQ' = tdQ \ {j}
  /\ UNCHANGED <<rows, env, gcnt, rel, ex, age, mnt, branched, iso>>

\* Rule 2 for archived environments.  CleanupPrunesPinned: the job also
\* prunes a live environment's goldens beyond the newest K.
EnvGoldenDelete(d, g) ==
  /\ Rule2On /\ JobRuns(d) /\ g \in Range(env[d].gs) /\ PinGuard(d, g)
  /\ CleanupPrunesPinned /\ env[d].st = "live" /\ g \in BeyondK(d)
  /\ DelBy({Golden(g)}, d)
  /\ DropGoldens(d, {g})
  /\ UNCHANGED <<rows, gcnt, rel, tdQ, branched>>

\* Rule 3: an agents drive not the current release's that no box mounts.
AgentsCleanup(d, a) ==
  /\ Rule3On /\ JobRuns(d)
  /\ ex[Agents(a)] /\ a # rel
  /\ ~\E b \in Res : b[1] = "box" /\ ex[b] /\ mnt[b] = a
  /\ DelBy({Agents(a)}, d)
  /\ UNCHANGED <<rows, env, gcnt, rel, tdQ, branched>>

NamedIn(d, r) ==
  IF r[1] = "golden"
  THEN (env[d].st = "live" /\ (r[2] \in Range(env[d].gs) \/ env[d].act = r[2])) \/ PinnedIn(d, r[2])
  ELSE \E w \in WS : NamesWs(d, w, r[2])

\* Rule 3: anything nothing in d refers to, older than LeftoverAge.
\* LeftoverBoxesOnly: the literal "a box no row names".
Leftover(d, r) ==
  /\ Rule3On /\ JobRuns(d)
  /\ Aging(r) /\ ex[r] /\ age[r] >= LeftoverAge
  /\ LeftoverBoxesOnly => r[1] = "box"
  /\ ~NamedIn(d, r)
  /\ DelBy({r}, d)
  /\ UNCHANGED <<rows, env, gcnt, rel, tdQ, branched>>

-----------------------------------------------------------------------------
User == \E d \in DBs, w \in WS :
          Create(d, w) \/ Boot(d, w) \/ Wake(d, w) \/ Sleep(d, w) \/ Archive(d, w)
          \/ Unarchive(d, w) \/ Fail(d, w)
Deploys == Branch \/ Release \/ \E d \in DBs : OrgDelete(d) \/ EnvArchive(d) \/ Build(d) \/ BuildPrune(d)
CleanupJob ==
  \/ \E d \in DBs, w \in WS : Retire(d, w) \/ RetireHalf(d, w)
  \/ \E j \in tdQ : TdRun(j) \/ TdGiveUp(j)
  \/ \E d \in DBs, g \in GNames : EnvGoldenDelete(d, g)
  \/ \E d \in DBs, a \in 1..MaxReleases : AgentsCleanup(d, a)
  \/ \E d \in DBs, r \in Res : Leftover(d, r)

Next == Tick \/ User \/ Deploys \/ CleanupJob \/ \E b \in Res : VercelExpire(b)

Spec == Init /\ [][Next]_vars

FairSpec ==
  /\ Spec
  /\ WF_vars(Tick)
  /\ \A d \in DBs, w \in WS : WF_vars(Retire(d, w)) /\ WF_vars(RetireHalf(d, w))
  /\ \A d \in DBs :
       /\ WF_vars(\E n \in WsNames : TdRun(<<d, n>>))
       /\ WF_vars(BuildPrune(d))
       /\ WF_vars(\E g \in GNames : EnvGoldenDelete(d, g))
       /\ WF_vars(\E a \in 1..MaxReleases : AgentsCleanup(d, a))
       /\ WF_vars(\E r \in Res : Leftover(d, r))

-----------------------------------------------------------------------------
(* Properties.  "Used" and "kept" are by production.                        *)

Used(r) ==
  CASE r[1] \in {"box", "drive"} -> \E w \in WS : NamesWs("PROD", w, r[2])
    [] r[1] = "golden" ->
         \/ env["PROD"].st = "live" /\ env["PROD"].act = r[2]
         \/ Overlay /\ PinnedIn("PROD", r[2])
    [] r[1] = "agents" ->
         \/ rel = r[2]
         \/ \E b \in Res : b[1] = "box" /\ ex[b] /\ mnt[b] = r[2]

NoDeleteWhileUsed == [][\A r \in Res : ex[r] /\ ~ex'[r] => ~Used(r)]_vars

Isolation == iso

Retires(d, w) == Live(d, w) /\ rows[d][w].n # None /\ rows'[d][w].n = None /\ rows'[d][w].st # "gone"
Retention ==
  [][ /\ \A d \in DBs, w \in WS : Retires(d, w) => Due(d, w)
      /\ \A r \in Res :
           (r[1] \in {"box", "drive"} /\ ex[r] /\ ~ex'[r]) =>
             \/ \E d \in DBs : <<d, r[2]>> \in tdQ
             \/ age[r] >= LeftoverAge
             \/ \E d \in DBs, w \in WS : NamesWs(d, w, r[2]) /\ Due(d, w)
  ]_vars

\* A row past its wait keeps nothing.
Kept(r) ==
  CASE r[1] \in {"box", "drive"} -> \E w \in WS : NamesWs("PROD", w, r[2]) /\ ~Due("PROD", w)
    [] r[1] = "golden" -> Used(r) \/ (env["PROD"].st = "live" /\ r[2] \in NewestK("PROD"))
    [] OTHER -> Used(r)

NoLeak == \A r \in Res : (ex[r] /\ ~Kept(r)) ~> (~ex[r] \/ Kept(r))

TypeOK ==
  /\ \A d \in DBs, w \in WS : rows[d][w].st \in {"none", "provisioning", "awake", "asleep", "archived", "failed", "gone"}
  /\ tdQ \subseteq DBs \X WsNames
  /\ \A r \in Res : age[r] \in 0..LeftoverAge
=============================================================================
