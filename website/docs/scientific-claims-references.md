# Scientific claims and their sources

This document tracks every behaviour-change / habit-formation claim on the
marketing site (`website/src/`) that is backed by a footnote, which source
backs it, and why that source actually supports the claim. It exists so the
citations can be audited and kept honest as copy changes.

The footnote markers and full citations live in code, not here:
- Bibliography: [`src/data/references.ts`](../src/data/references.ts)
- Inline marker: [`src/components/Cite.astro`](../src/components/Cite.astro)
- Per-page "Sources" list: [`src/components/References.astro`](../src/components/References.astro)

Footnote numbers are **per page** (each page's Sources list starts at 1), so
the same source can carry a different number on different pages. This
document is organized by page to match that.

---

## Home (`/`, `/en/`)

Rendered by [`Home.astro`](../src/components/Home.astro), via
[`Perspective.astro`](../src/components/Perspective.astro) and
[`HabitCluster.astro`](../src/components/HabitCluster.astro).

### "Most health apps collect data that no one ever learns from. And most behaviour research never reaches a real app."
*(`what_sub`, in the "One platform, two points of view" section)*

| Source | Why it supports the claim |
|---|---|
| Reinsch, Sitzberger, Kählig, & Stark (2026). *Built for sprints, needed for marathons: Mapping the gap between science, users, and implementation in digital habit formation apps.* ECIS. | This is our own paper on exactly this gap — it maps where habit-formation science, user needs, and shipped app implementations diverge, which is the direct evidence for the claim that research and practice talk past each other. |
| Middelweerd, Mollee, van der Wal, Brug, & te Velde (2014). *Apps to promote physical activity among adults: A review and content analysis.* IJBNPA. | Content-analysed 64 real physical-activity apps and found they used, on average, only 5 of 23 known behaviour-change techniques — independent, empirical evidence that most shipped health apps aren't built on the behavioural evidence base, i.e. that "data collected" rarely reflects what research knows. |

### "A model learns from the real, aggregated behaviour of thousands of people, not assumptions."
*(`graph_loop_3_p`, step 3 of the "many habits become one network" loop)*

| Source | Why it supports the claim |
|---|---|
| Reinsch, Weimann, & Stark (2024). *Tailoring health: Contextual variables in health recommender systems.* HealthRecSys @ ACM RecSys. | Our own paper on how contextual, real-world variables (not assumed rules) can be built into a health recommender — the design basis for the recommender this claim describes. |
| De Croon, Van Houdt, Htun, Štiglic, Vanden Abeele, & Verbert (2021). *Health recommender systems: Systematic review.* JMIR. | A systematic review of the health-recommender-system field confirming that collaborative filtering — recommending from patterns in aggregated user behaviour rather than fixed rules — is the dominant, established approach, which is the general claim being made here. |

---

## Take part (`/teilnehmen/`, `/en/participate/`)

Rendered by [`Participants.astro`](../src/components/Participants.astro).

### "Watch habits become second nature... reminders quietly fade once a habit sticks."
*(`p_s2_p`, "Habits" screen)*

| Source | Why it supports the claim |
|---|---|
| Lally, van Jaarsveld, Potts, & Wardle (2010). *How are habits formed: Modelling habit formation in the real world.* European Journal of Social Psychology. | The foundational real-world study showing habits become automatic through repetition and that the *need* for conscious prompting decreases as automaticity rises — the direct basis for "becomes second nature." |
| Nahum-Shani, Smith, Spring, Collins, Witkiewitz, Tewari, & Murphy (2018). *Just-in-time adaptive interventions (JITAIs) in mobile health.* Annals of Behavioral Medicine. | Defines the design principles for support that adapts to (and can withdraw as) a person's changing state — the established framework behind "reminders quietly fade." |
| Reinsch, Weimann, & Stark (2025). *From instant cues to fading views: Piloting just-in-time and fading strategies in digital habit formation.* AMCIS. | Our own pilot testing the specific fading-support mechanism described in the claim, inside a digital habit app. |

### "Suggestions that fit you... ideas grounded in behavioural science."
*(`p_s4_p`, "Recommendations" screen)*

| Source | Why it supports the claim |
|---|---|
| Michie et al. (2013). *The behavior change technique taxonomy (v1) of 93 hierarchically clustered techniques.* Annals of Behavioral Medicine. | The standard, consensus taxonomy of behaviour change techniques — the vocabulary of "behavioural science" that the app's suggestions are claimed to draw on. |
| De Croon, Van Houdt, Htun, Štiglic, Vanden Abeele, & Verbert (2021). *Health recommender systems: Systematic review.* JMIR. | Establishes that grounding recommendations in behavioural evidence, rather than generic advice, is the field's stated goal and known practice for health recommender systems. |
| Reinsch, Weimann, & Stark (2024). *Tailoring health: Contextual variables in health recommender systems.* HealthRecSys @ ACM RecSys. | Our own paper describing how the app's recommendation logic is actually built from contextual, evidence-based variables. |

### "Established measures like the Self-Report Habit Index are tracked over time."
*(`p_s5_p`, "SRHI" screen)*

| Source | Why it supports the claim |
|---|---|
| Verplanken & Orbell (2003). *Reflections on past behavior: A self-report index of habit strength.* Journal of Applied Social Psychology. | This is the paper that introduced the Self-Report Habit Index (SRHI) itself — the primary source for the named instrument, confirming it's a real, validated, peer-reviewed measure and not an invented metric. |

---

## Research (`/forschung/`, `/en/research/`)

Rendered by [`Research.astro`](../src/components/Research.astro).

### "Validated questionnaires... established instruments like the Self-Report Habit Index."
*(`r_cap_2_p`)*

| Source | Why it supports the claim |
|---|---|
| Verplanken & Orbell (2003). *Reflections on past behavior: A self-report index of habit strength.* Journal of Applied Social Psychology. | Same as above — the SRHI's origin paper, confirming the instrument is peer-reviewed and validated rather than proprietary or made up. |

### "Knowledge base and recommendations... feeds the recommendations participants receive in the app."
*(`r_cap_3_p`)*

| Source | Why it supports the claim |
|---|---|
| Michie et al. (2013). *The behavior change technique taxonomy (v1) of 93 hierarchically clustered techniques.* Annals of Behavioral Medicine. | Same as in the participant section — the taxonomy that gives the "knowledge base" its behavioural-science content, rather than ad hoc tips. |
| De Croon, Van Houdt, Htun, Štiglic, Vanden Abeele, & Verbert (2021). *Health recommender systems: Systematic review.* JMIR. | Confirms that feeding a shared knowledge base into personalised health recommendations is an established, reviewed approach in the literature, not a novel or unverified claim. |
| Reinsch, Weimann, & Stark (2024). *Tailoring health: Contextual variables in health recommender systems.* HealthRecSys @ ACM RecSys. | Our own paper describing the actual knowledge-base-to-recommendation pipeline this claim refers to. |

---

## Sources defined but not currently cited

| Source | Status |
|---|---|
| Wood & Rünger (2016). *Psychology of habit.* Annual Review of Psychology. | Kept in [`references.ts`](../src/data/references.ts) as a strong general review of habit psychology, available to back a future claim. Not attached to a specific claim yet to avoid citation-padding — remove or use it the next time habit-formation copy changes. |

---

## Maintenance notes

- When copy changes, check whether the citation next to it still matches what the new text actually says — a citation is only honest if it supports the *current* wording.
- Prefer at least one external (non-team) source per claim where one exists; team papers alone read as self-referential even when accurate.
- All DOIs/URLs above were checked against the publisher or PubMed record before being added (September 2026).
