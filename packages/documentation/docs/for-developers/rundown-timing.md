---
title: Rundown Timing
sidebar_position: 13
---

Every clock in Sofie — "Rem. Dur", the countdown to a Part, the width of a Part in the segment
timeline, the Over/Under — comes from one computation on the server, published over DDP as the
`playlistTimingState` publication. Nothing computes rundown timing on the client.

This page covers why it works that way, the one idea the whole design rests on, and what you need to
know to consume it.

## Why it is on the server

Rundown timing is not simple arithmetic. A Part's duration might come from its as-played duration,
its `expectedDurationWithTransition`, its share of a display-duration group's shared pool, or the
Studio's `defaultDisplayDuration` — and which one depends on whether it has played, whether it is on
air, whether it is in a group, and what its neighbours did. Countdowns accumulate across Parts in
playout order, which is not ingest order and which QuickLoop can rewrite. A Segment with a
`budgetDuration` ignores several of these rules entirely.

That logic used to live in the web UI, and it ran over the whole playlist sixty times a second. It
had two problems:

- **Nobody else could reproduce it.** Anything outside the Sofie UI that wanted to show the same
  numbers — a Live Status Gateway client, a control panel, an in-house dashboard — had to
  reimplement the entire cascade and stay in step with it forever. In practice that is not feasible.
- **It was expensive**, in proportion to the size of the rundown.

Both are solved by computing it once, on the server, and publishing the result.

## The core idea: TimerState

The obvious way to publish a countdown is to publish the number and update it constantly. That is
either inaccurate or extremely chatty.

Instead the server publishes a **`TimerState`** — a description of how a value moves, anchored to
absolute unix timestamps. The consumer evaluates it against its own clock, at whatever rate it
renders, and gets a millisecond-accurate answer without the server saying anything.

```ts
type TimerState =
	| { paused: false; zeroTime: number; pauseTime?: number | null }
	| { paused: true; duration: number; resumesAt?: number | null }
```

A running timer counts down to `zeroTime`. A paused one holds at `duration`. Each variant carries
the timestamp of its transition into the *other* state, so a change of slope that is known in
advance does not need a new message at the moment it happens:

- `pauseTime` on a running timer — when it freezes. The remaining-duration countdown stops falling
  once the on-air Part overruns its planned end, and that end is known the moment the Part starts.
- `resumesAt` on a paused timer — when it starts running. After a take in a multi-gateway studio the
  Part's start is a little way in the future; the timer holds until it arrives, then runs.

A state therefore has **at most one breakpoint**. Anything needing more relies on an updated state
being published in between, which in practice there is ample time for.

Two functions read a state, both in
[`corelib/src/dataModel/TimerState.ts`](https://github.com/Sofie-Automation/sofie-core/blob/main/packages/corelib/src/dataModel/TimerState.ts):

- `timerStateToDuration(state, now)` — milliseconds remaining, for a countdown display
- `timerStateToZeroTime(state, now)` — the absolute timestamp it reaches zero, for a wall clock

The same state answers both questions, which is why a value is published once rather than twice.

There is also `offsetTimerState(state, ms)`, which shifts a state by a constant. It is how a family
of timers differing only by a fixed head start — the countdown to every upcoming Part — is expressed
as offsets from the single one that is actually ticking, so they cannot drift apart from each other.

### The count-up convention

A `TimerState`'s duration read can hold or fall, never rise. So anything that counts *up* is
published as a value that falls: `played`, `playedOut` and `liveDisplayDuration` all read negative,
and the positive elapsed time is `0 - timerStateToDuration(state, now)`.

This is the one thing that surprises people. The UI hides it behind a `TimerValueMode.CountUp`
option on its hooks; an external consumer negates.

## What is published

One publication, `playlistTimingState`, carrying a discriminated union keyed on `type`. Consumers
must narrow on `type` and must include it in any projection. The shapes are defined in
[`corelib/src/dataModel/TimingState.ts`](https://github.com/Sofie-Automation/sofie-core/blob/main/packages/corelib/src/dataModel/TimingState.ts).

**`type: 'playlist'`** — one per playlist. The rundown header's clocks: `plannedStart`, `plannedEnd`,
`plannedDuration`, `startedPlayback`, `remainingDuration`, `estimatedEnd`, `overUnder`, plus the
on-air timers `remainingOnCurrentPart` and `remainingBudgetOnCurrentSegment`. It also carries
`currentPartInstanceId` and `currentSegmentId` so a component rendering one specific Part can tell
whether the on-air timers are about *its* Part — they and the playlist can disagree for a moment
after a take.

**`type: 'segment'`** — one per segment: `plannedDuration`, `playedOut`, `remaining`, and the
`countdownType` that decides how they are displayed.

**`type: 'part'`** — one per part. The **resolved** durations, with the whole cascade already
applied: `expectedDuration`, `displayDuration`, `duration`, plus `countdown`, `played`,
`liveDisplayDuration`, and the flags `isInQuickLoop` and `countsTowardsTiming`. It carries `rank`,
the playout order, because documents have none of their own and several displays need "the parts in
order" or "the first part".

An absent `countdown` means the Part will probably not be played if the rundown is played in order —
which is what the UI uses to decide not to show a countdown at all.

## Consuming it

### From an external client

This is the case the design exists for. You need:

1. `timerStateToDuration` and `timerStateToZeroTime` — nine lines each, ported from the file linked
   above
2. a running sum, if you want Part offsets within a Segment: sum `liveDisplayDuration` over the
   Segment's parts in `rank` order

That is the whole surface. No duration cascade, no display-duration-group pooling, no QuickLoop
deduplication, no countdown accumulation. Take the number you want from the document.

Note that offsets are only ever needed *within* a segment — every place the Sofie UI uses them, it
uses the difference between two Parts of the same Segment — so there is no need to accumulate across
the whole playlist.

### From the Sofie web UI

Hooks in
[`webui/src/client/ui/RundownView/RundownTiming/usePlaylistTimingValue.ts`](https://github.com/Sofie-Automation/sofie-core/blob/main/packages/webui/src/client/ui/RundownView/RundownTiming/usePlaylistTimingValue.ts):

```ts
usePlaylistTimingValue(playlistId, 'remainingDuration', TimerValueMode.Duration)
useSegmentTimingValue(segmentId, 'remaining', TimerValueMode.Duration)
usePartTimingValue(partId, 'played', TimerValueMode.CountUp)
useSegmentPartTimings(segmentId) // a segment's parts with offsets accumulated, for geometry
```

Each returns an evaluated number (or `null` when that timer is not published), re-evaluated on a
timing tick at the resolution the caller asks for. The ticks are `window` events dispatched by
`RundownTimingProvider`, which is mounted by every view that shows a playlist. A component reading a
`TimerState` re-renders on its own tick, not when the server sends anything — in steady state the
server sends nothing at all.

`usePlaylistTimingField` / `usePartTimingField` read the non-timer fields, and deliberately do not
tick.

## Things worth knowing

**Do not compute timing on the client.** The web UI is the proof that the publication is sufficient:
its entire segment timeline — Part widths, offsets, the live line, the overtime shadow — renders from
these documents alone. If something cannot be built from them, the publication is missing a field,
and adding it there is the fix. A local workaround would be a second implementation that
external clients cannot use and that will drift.

**Documents are stable between playout events.** Recomputing later from unchanged inputs produces an
identical document, so the publication is quiet while a Part plays. This is asserted by tests, and it
is the property the whole low-volume design rests on.

**A take dirties every Part document.** Each Part's countdown is an offset from the one that is
running, and any absolute per-part time depends on the durations accumulated before it, so a take
moves all of them. This is inherent rather than a defect. For a 300-part rundown it is roughly 50 KB
per subscriber per take.

**Display-duration groups are not quite static.** The group's shared pool is drained by the on-air
Part's *live* display duration, so once that Part overruns, the later members of its group shrink
continuously. Their resolved durations are therefore not constant. This is pre-existing behaviour,
pinned by a test rather than fixed.

## Where the code is

- **`corelib/src/dataModel/TimerState.ts`** — the state type and its evaluators. Shared with
  anything that consumes the publication.
- **`corelib/src/dataModel/TimingState.ts`** — the published document shapes.
- **`meteor/server/publications/playlistTimingState/`** — the publication, and in `rundownTiming/`
  beneath it, the calculator and the per-area assembly. Server-only, deliberately: it lives inside
  the publication so that it cannot be imported into the client.
