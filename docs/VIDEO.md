# The demo video: chapters and transcript

[LIMBO demo on YouTube](https://youtu.be/V4m3zTV5MPs) (public, 2:47). Product footage is captured from the deployed apps in real time; the Stop-gate scene replays logged Kiro session `sess_545bc98d` from [`evidence/kiro/hooks.jsonl`](../evidence/kiro/hooks.jsonl), as labelled on screen. Voiceover: ElevenLabs (synthetic voice). Music and sound effects: synthesized for this video; no third-party music.

The chapters are the ones in the video's YouTube description. The transcript is the voiceover, with the start time of each caption cue (minutes:seconds). The `/judge` page reads both from this file.

## On screen

What the picture shows where a chapter's title does not say it (checked against frames of the uploaded file):

- 0:00 BASECAMP live, replica A after reconnect: the tent's twin card, "TWIN · Budi deleted this while Sari ticked it · rule: resurrect"
- 1:43 the `/.kiro` tree at the repository root: 12 specs, 2 agents, 6 steering files, 8 hooks
- 2:00 slide 10 of the deck, replaying logged Kiro session `sess_545bc98d` line by line from `evidence/kiro/hooks.jsonl`

## Chapters

- 0:00 The lake scene: cut the link
- 0:33 Your own edit, not scripted
- 0:50 AFTERSHOCK: a second app on the same skeleton
- 1:11 Offline reload and the Limbo inspector
- 1:32 One skeleton, two folders
- 1:43 How Kiro built it
- 2:00 The Stop gate, replayed
- 2:16 The receipts
- 2:36 Try it

## Transcript

- 0:02.5 Two replicas of one camping list.
- 0:04.7 We cut the link.
- 0:05.8 This is for anyone whose shared list breaks when the signal does.
- 0:10.2 Offline, Sari ticks the tent while Budi deletes it, and both claim the last stove.
- 0:16.4 Reconnect, and both conflicts surface.
- 0:19.1 The deleted tent comes back as a ghost twin, with the rule that decided it.
- 0:24.5 The stove goes to exactly one person, on both replicas, and Budi is told.
- 0:29.8 One tap each, and the fog lifts.
- 0:34.1 That was the scripted scene.
- 0:36.3 This edit is ours.
- 0:37.8 Add marshmallows;
- 0:39.1 it syncs.
- 0:39.9 Cut the link.
- 0:40.9 Tick it on one side, delete it on the other.
- 0:44.4 Restore:
- 0:45.1 a twin on both cards.
- 0:46.7 Keep it, and the lists match.
- 0:50.2 The same skeleton runs a second, different app:
- 0:53.9 AFTERSHOCK, a survey form for field teams, on demo data.
- 0:58.3 Offline, Sari marks sector C3 damaged;
- 1:01.2 Budi marks it unsafe.
- 1:02.9 On reconnect the worse report wins, and both head counts are kept.
- 1:08.0 Their two notes come back side by side.
- 1:12.0 Now the browser itself goes offline.
- 1:14.6 A reload still opens the app from the service worker,
- 1:18.5 with every edit read back from IndexedDB.
- 1:22.3 None of it is a skin.
- 1:23.8 Fog means this replica's link is down,
- 1:26.5 and the inspector lists every queued op with the merge rule it declares.
- 1:32.2 Both apps live in their own folders on one skeleton.
- 1:36.5 Each supplies just five things:
- 1:39.1 a model, its ops, a seed, its views, and a config.
- 1:43.7 Most of it was built by Kiro, from twelve Kiro-authored specs.
- 1:48.2 Headless Kiro CLI sessions ran the tasks under steering rules:
- 1:52.7 no wall clock;
- 1:53.8 every op commutes or declares its merge.
- 1:56.7 Hooks ran the convergence properties after spec tasks.
- 2:01.2 Here is one logged session, replayed.
- 2:03.7 We seeded a wall-clock fault on purpose.
- 2:06.5 Kiro tried to finish.
- 2:07.9 The Stop hook blocked it, because the convergence properties failed.
- 2:12.6 Kiro removed the clock, and the properties passed.
- 2:17.1 Every number is in the repo.
- 2:19.1 Ten thousand random orderings across three replicas, zero divergences:
- 2:23.9 measured, not proven.
- 2:25.4 Ninety-three percent of product commits came from Kiro sessions.
- 2:29.9 Our pre-registered A/B test of the kit found no measurable effect,
- 2:34.5 and we published it as run.
- 2:36.9 Today the two replicas share one page;
- 2:39.8 a cross-device relay is next.
- 2:42.0 Cut the link yourself, at the judge page on screen.
