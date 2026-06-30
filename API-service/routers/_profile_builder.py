"""Deterministic user profile builder — no LLM required.

Replaces the extract-profile LLM call inside the recommend pipeline.
The /llm/extract-profile endpoint is unchanged and still usable standalone.

Questionnaire responses are accepted as a generic dict[slug, response] so that
researchers can add or replace questionnaires without code changes — only the
PROFILE_QUESTIONNAIRE_SLUGS env var in recommend.py needs updating.

Known slugs (sliq, rand-36) receive human-readable label mappings.
Unknown slugs are formatted generically using their raw questionId keys,
so new questionnaires appear in the profile detail automatically.

Per-study questionnaire lists (where study A uses sliq and study B uses phq-9)
would require a user→study lookup to fetch the right slugs dynamically.
That is a backend-level extension; this builder is already compatible with it
since it accepts whatever slugs the caller provides.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, cast


@dataclass
class ProfileResult:
    profile_summary: str
    profile_detailed: str
    rag_query: str


# ---------------------------------------------------------------------------
# Label mappings for known questionnaires
# Key = questionId as stored in form_responses.answers
# ---------------------------------------------------------------------------

_KNOWN_LABELS: dict[str, dict[str, str]] = {
    "sliq": {
        "sliq_sleep_quality": "sleep quality",
        "sliq_sleep_duration": "sleep duration (hrs/night)",
        "sliq_daytime_sleepiness": "daytime sleepiness",
        "sliq_sleep_satisfaction": "sleep satisfaction",
        "sliq_sleep_latency": "sleep latency",
        "sliq_sleep_efficiency": "sleep efficiency",
        "sliq_sleep_disturbances": "sleep disturbances",
        "sliq_use_of_medication": "sleep medication use",
        "sliq_daytime_dysfunction": "daytime dysfunction",
    },
    "rand-36": {
        "rand36_physical_functioning": "physical functioning",
        "rand36_role_physical": "role limitations (physical)",
        "rand36_role_emotional": "role limitations (emotional)",
        "rand36_energy": "energy/vitality",
        "rand36_emotional_wellbeing": "emotional wellbeing",
        "rand36_social_functioning": "social functioning",
        "rand36_pain": "bodily pain",
        "rand36_general_health": "general health",
        "rand36_mental_health": "mental health",
    },
}


def build_profile(
    goal: str,
    questionnaire_responses: dict[str, Any],
    profile_data: Optional[dict],
) -> ProfileResult:
    """Build a structured user profile from questionnaire data.

    Args:
        goal: The participant's stated health goal.
        questionnaire_responses: Mapping of questionnaire slug to the most
            recent response dict (with an ``answers`` key), or None if the
            participant has not yet completed that questionnaire.  All provided
            slugs are included in the profile detail; unknown slugs are
            formatted generically.
        profile_data: User profile document with a ``fields`` list of
            ``{questionId, questionText, label}`` dicts (age, gender, …).

    Returns:
        ProfileResult with profile_summary, profile_detailed, and rag_query.
    """
    # --- Demographics (generic: all profile fields as questionText: label) ---
    demo_parts: list[str] = []
    if profile_data and profile_data.get("fields"):
        for f in cast(list[dict], profile_data["fields"]):
            text = str(f.get("questionText", ""))
            label = str(f.get("label", ""))
            if text and label:
                demo_parts.append(f"{text}: {label}")
    demo_str = ", ".join(demo_parts) if demo_parts else "participant"

    # --- Questionnaire sections ---
    sections: list[str] = [f"Demographics: {demo_str}."]
    all_answers: dict[str, str] = {}  # flat key→value for summary note extraction

    for slug, response in questionnaire_responses.items():
        answers: dict = (response or {}).get("answers", {})
        all_answers.update(answers)

        label_map = _KNOWN_LABELS.get(slug, {})
        lines = [
            f"  {label_map.get(k, k)}: {v}"
            for k, v in answers.items()
            if v is not None
        ]
        if lines:
            sections.append(f"{slug.upper()} questionnaire:\n" + "\n".join(lines))
        else:
            sections.append(f"{slug.upper()} questionnaire: no data")

    if not questionnaire_responses:
        sections.append("No questionnaire responses available.")

    sections.append(f"Goal: {goal}")
    profile_detailed = "\n".join(sections)

    # --- profile_summary (concise, human-readable) ---
    sleep_note = _extract_note(all_answers, {
        "sliq_sleep_quality": "quality {v}",
        "sliq_sleep_duration": "~{v} hrs/night",
    })
    health_note = _extract_note(all_answers, {
        "rand36_physical_functioning": "physical functioning {v}",
        "rand36_energy": "energy {v}",
        "rand36_mental_health": "mental health {v}",
    })

    summary_parts = [f"{demo_str}."]
    if sleep_note:
        summary_parts.append(f"Sleep: {sleep_note}.")
    if health_note:
        summary_parts.append(f"Health: {health_note}.")
    if not sleep_note and not health_note and questionnaire_responses:
        # Some questionnaires present but no known summary keys — note the count
        n = sum(1 for r in questionnaire_responses.values() if r and r.get("answers"))
        if n:
            summary_parts.append(f"{n} questionnaire response(s) included.")
        else:
            summary_parts.append("No questionnaire data available.")
    elif not questionnaire_responses:
        summary_parts.append("No questionnaire data available.")
    profile_summary = " ".join(summary_parts)

    # --- rag_query ---
    query_parts = [goal]
    if demo_parts:
        query_parts.append(demo_str)
    if sleep_note:
        query_parts.append(sleep_note)
    rag_query = f"Habit interventions for: {'; '.join(query_parts)}."

    return ProfileResult(
        profile_summary=profile_summary,
        profile_detailed=profile_detailed,
        rag_query=rag_query,
    )


def _extract_note(
    all_answers: dict[str, str],
    templates: dict[str, str],
) -> str:
    """Build a short phrase from answers for the given key→format-string mapping."""
    parts: list[str] = []
    for key, tmpl in templates.items():
        val = all_answers.get(key)
        if val:
            parts.append(tmpl.format(v=val))
    return ", ".join(parts)
