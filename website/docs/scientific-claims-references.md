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
*(`what_sub`)*

| Source | Why it supports the claim |
|---|---|
| Reinsch, Sitzberger, Kählig, & Stark (2026), ECIS 2026 | Our own paper mapping where habit-formation science, user needs and shipped app implementations diverge — the direct evidence for both halves of the claim. |
| Middelweerd et al. (2014), *International Journal of Behavioral Nutrition and Physical Activity* | Content-analysed 64 physical-activity apps: on average 5 of 23 behaviour change techniques. Independent evidence for the second sentence ("research never reaches a real app"); it does not speak to the first. Limited to fitness apps and from 2014. |

### "…a graph of thousands of real behaviours, where related habits move closer together."
*(`graph_sub`)*

| Source | Why it supports the claim |
|---|---|
| Noble, Paul, Turon, & Oldmeadow (2015), *Preventive Medicine* | Systematic review showing real health behaviours (smoking, nutrition, alcohol, physical activity) cluster within people — independent evidence that related habits genuinely belong together, which is what the graph visualises. "Thousands" is a claim about our own scale that no source backs. |

### "A model learns from the real, aggregated behaviour of thousands of people, not assumptions."
*(`graph_loop_3_p`, step 3 of the loop)*

| Source | Why it supports the claim |
|---|---|
| Reinsch, Weimann, & Stark (2024), HealthRecSys 2024 (CEUR) | Our own paper on building contextual, real-world variables into a health recommender — the design basis of the app's recommender. |
| De Croon et al. (2021), *Journal of Medical Internet Research* | Reviews 73 implemented and evaluated health recommender systems, which by its own definition recommend "based on observed user behavior". It finds most systems are *hybrid*; don't cite it for collaborative filtering being dominant. |

### "…stored only as an aggregate graph. That makes it much harder to trace entries back to individuals, who can often be re-identified from detailed data even without a name."
*(`graph_method` (softened from "No conclusions about individuals are possible"))*

| Source | Why it supports the claim |
|---|---|
| Rocher, Hendrickx, & de Montjoye (2019), *Nature Communications* | Shows 99.98% of Americans can be re-identified from 15 demographic attributes in "anonymised" data — the reason for storing only aggregates, and why the copy no longer claims re-identification is impossible. |
| Sweeney (2002), *International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems* | The foundational k-anonymity paper: grouping records so individuals are indistinguishable protects privacy. Cited as the principle behind aggregation — the code does **not** enforce a formal k threshold, so the copy must not claim k-anonymity. |

---

## Take part (`/teilnehmen/`, `/en/participate/`)

Rendered by [`Participants.astro`](../src/components/Participants.astro).

The five screens are shuffled per build and the last one has no caption, so
one screen claim is always hidden. The page's Sources list is derived from
the captions actually shown, so it only lists what is cited on the page.

### "The Health Habit Hub turns small daily steps into visible patterns."
*(`p_hero_lead`)*

| Source | Why it supports the claim |
|---|---|
| Harkin et al. (2016), *Psychological Bulletin* | Meta-analysis of 138 experiments: monitoring progress promotes goal attainment, with larger effects when progress is physically recorded — the core idea of turning daily steps into visible patterns. |
| Michie, Abraham, et al. (2009), *Health Psychology* | Meta-regression of 122 healthy-eating/physical-activity interventions: self-monitoring was the technique most associated with effectiveness. |

### "Watch habits become second nature… Reminders quietly fade once a habit sticks."
*(`p_s2_p`)*

| Source | Why it supports the claim |
|---|---|
| Wood & Rünger (2016), *Annual Review of Psychology* | Standard review defining habit as a context-cued, automatic response learned through repetition — the definition behind "second nature". |
| Lally, van Jaarsveld, Potts, & Wardle (2010), *European Journal of Social Psychology* | Foundational real-world study: automaticity rises with daily repetition (asymptotic curve, median ~66 days). |
| Stawarz, Cox, & Blandford (2015), ACM CHI | Found reminders support repetition but reliance on them can hinder automaticity — the reason reminders should fade. |
| Reinsch, Weimann, & Stark (2025), AMCIS 2025 | Our own pilot of the fading mechanism implemented in `app/services/reminderPlanService.js` (reminder tier falls as SRHI and adherence rise). |

### "Instead of generic advice you get ideas grounded in behavioural science, each with a plain rationale…"
*(`p_s4_p`)*

| Source | Why it supports the claim |
|---|---|
| Michie, Richardson, et al. (2013), *Annals of Behavioral Medicine* | The consensus taxonomy of behaviour change techniques — the vocabulary of "behavioural science" the suggestions draw on. |
| Michie, West, et al. (2021), *Wellcome Open Research* (BCIO) | The recommender tags habits with concepts from this ontology (`API-service/routers/_gds_ranking.py`, `API-service/data/bcio.owl`), so it is the precise source for the recommendations' scientific grounding. |
| Noar, Benac, & Harris (2007), *Psychological Bulletin* | Meta-analysis showing tailored health messages outperform generic ones — backs "instead of generic advice". |
| Tintarev & Masthoff (2007), IEEE ICDE Workshops | Standard survey of why recommenders explain their suggestions (transparency, trust, persuasiveness) — backs "each with a plain rationale". |
| Reinsch, Weimann, & Stark (2024), HealthRecSys 2024 (CEUR) | Our own paper on building contextual, real-world variables into a health recommender — the design basis of the app's recommender. |

### "…established measures like the Self-Report Habit Index are tracked over time, so you can watch an intention turn into a genuine routine."
*(`p_s5_p`)*

| Source | Why it supports the claim |
|---|---|
| Verplanken & Orbell (2003), *Journal of Applied Social Psychology* | The paper that developed and validated the SRHI. The app administers the full 12-item version (`app/utils/srhi.js`). |
| Sheeran & Webb (2016), *Social and Personality Psychology Compass* | Reviews the intention–behaviour gap: intentions alone often don't become action — the problem the "intention → routine" path addresses. |
| Gollwitzer (1999), *American Psychologist* | Foundational paper on if-then plans (implementation intentions), the format in which the app records the intention a habit starts from. |
| Lally & Gardner (2013), *Health Psychology Review* | Describes habit formation as the transition from deliberate, intention-driven action to automatic routine. |

---

## Research (`/forschung/`, `/en/research/`)

Rendered by [`Research.astro`](../src/components/Research.astro).

### "…to join, in about a minute… so no one is excluded because of their phone. Low entry barriers matter, because app-based studies routinely lose a large share of their participants."
*(`r_arch_app_x` (replaces "your sample is not skewed by platform", which the evidence doesn't support — Götz et al., 2017, find iOS and Android users differ only little))*

| Source | Why it supports the claim |
|---|---|
| Eysenbach (2005), *Journal of Medical Internet Research* | The foundational paper on attrition in eHealth trials. |
| Meyerowitz-Katz et al. (2020), *Journal of Medical Internet Research* | Meta-analysis: pooled dropout of about 43% in app-based interventions — the "large share" in the claim. |

### "For you as a researcher it is a controllable intervention whose effect you can measure in the same system."
*(`r_arch_rec_x`)*

| Source | Why it supports the claim |
|---|---|
| De Croon et al. (2021), *Journal of Medical Internet Research* | Half of the reviewed studies only evaluated the algorithm; the review calls for impact evaluations (RCTs, in-the-wild studies) — the gap a measurable in-platform recommender addresses. |
| Yardley et al. (2016), *American Journal of Preventive Medicine* | Argues engagement with digital behaviour-change interventions must be measured as "effective engagement" with outcomes, not raw usage — what the platform lets researchers measure. |

### "Established instruments like the Self-Report Habit Index, collected automatically across the study."
*(`r_cap_2_p`)*

| Source | Why it supports the claim |
|---|---|
| Verplanken & Orbell (2003), *Journal of Applied Social Psychology* | The paper that developed and validated the SRHI. The app administers the full 12-item version (`app/utils/srhi.js`). |

### "A shared knowledge base feeds the recommendations participants receive in the app."
*(`r_cap_3_p`)*

| Source | Why it supports the claim |
|---|---|
| Michie, West, et al. (2021), *Wellcome Open Research* (BCIO) | The recommender tags habits with concepts from this ontology (`API-service/routers/_gds_ranking.py`, `API-service/data/bcio.owl`), so it is the precise source for the recommendations' scientific grounding. |
| Reinsch, Weimann, & Stark (2024), HealthRecSys 2024 (CEUR) | Our own paper on building contextual, real-world variables into a health recommender — the design basis of the app's recommender. |

---

## Removed sources

| Source | Why |
|---|---|
| Nahum-Shani et al. (2018), JITAIs in mobile health | Replaced on the reminder-fading claim by Stawarz et al. (2015), which addresses reminders and automaticity directly. |

---

## Maintenance notes

- When copy changes, check whether the citation next to it still matches what the new text actually says — a citation is only honest if it supports the *current* wording.
- Prefer at least one external (non-team) source per claim where one exists; team papers alone read as self-referential even when accurate.
- Entries in `references.ts` are APA 7 reference-list format; `*…*` marks the italic parts (journal + volume, or proceedings title). The DOI/URL is kept in `url` and rendered as the entry's final link. Author lists, volume/issue/pages come from Crossref — regenerate from there rather than retyping.
- All DOIs/URLs above were checked against Crossref or the publisher record (September 2026).
