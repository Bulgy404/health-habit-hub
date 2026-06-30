"""Unit tests for routers._profile_builder.build_profile."""

from routers._profile_builder import ProfileResult, build_profile


_SLIQ = {
    "answers": {
        "sliq_sleep_quality": "3",
        "sliq_sleep_duration": "6",
        "sliq_daytime_sleepiness": "2",
    }
}

_RAND36 = {
    "answers": {
        "rand36_physical_functioning": "4",
        "rand36_energy": "3",
        "rand36_mental_health": "4",
    }
}

_PROFILE = {
    "fields": [
        {"questionId": "age", "questionText": "Age", "value": 21, "label": "18–24"},
        {"questionId": "gender", "questionText": "Gender", "value": "male", "label": "Male"},
    ]
}

_GOAL = "improve sleep quality"

_RESPONSES = {"sliq": _SLIQ, "rand-36": _RAND36}


# ---------------------------------------------------------------------------
# Return type
# ---------------------------------------------------------------------------


def test_returns_profile_result():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert isinstance(result, ProfileResult)


# ---------------------------------------------------------------------------
# Full data — profile_summary
# ---------------------------------------------------------------------------


def test_profile_summary_includes_demographics():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert "18–24" in result.profile_summary
    assert "Male" in result.profile_summary


def test_profile_summary_includes_sleep_quality():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert "quality 3" in result.profile_summary


def test_profile_summary_includes_sleep_duration():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert "6 hrs/night" in result.profile_summary


def test_profile_summary_includes_health_note():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    # At least one RAND-36 indicator appears
    assert any(kw in result.profile_summary for kw in ["physical functioning", "energy", "mental health"])


# ---------------------------------------------------------------------------
# Full data — profile_detailed
# ---------------------------------------------------------------------------


def test_profile_detailed_contains_sliq_section():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert "SLIQ" in result.profile_detailed


def test_profile_detailed_contains_rand36_section():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert "RAND-36" in result.profile_detailed


def test_profile_detailed_contains_goal():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert _GOAL in result.profile_detailed


def test_profile_detailed_contains_all_sliq_answers():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert "sleep quality: 3" in result.profile_detailed
    assert "sleep duration (hrs/night): 6" in result.profile_detailed


# ---------------------------------------------------------------------------
# Full data — rag_query
# ---------------------------------------------------------------------------


def test_rag_query_contains_goal():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    assert _GOAL in result.rag_query


def test_rag_query_is_single_sentence():
    result = build_profile(_GOAL, _RESPONSES, _PROFILE)
    # Should not span multiple lines
    assert "\n" not in result.rag_query


# ---------------------------------------------------------------------------
# Missing SLIQ data
# ---------------------------------------------------------------------------


def test_missing_sliq_still_returns_profile():
    result = build_profile(_GOAL, {"sliq": None, "rand-36": _RAND36}, _PROFILE)
    assert isinstance(result, ProfileResult)
    assert result.profile_summary
    assert result.rag_query


def test_missing_sliq_noted_in_detailed():
    result = build_profile(_GOAL, {"sliq": None, "rand-36": _RAND36}, _PROFILE)
    assert "no data" in result.profile_detailed


# ---------------------------------------------------------------------------
# Missing RAND-36 data
# ---------------------------------------------------------------------------


def test_missing_rand36_still_returns_profile():
    result = build_profile(_GOAL, {"sliq": _SLIQ, "rand-36": None}, _PROFILE)
    assert isinstance(result, ProfileResult)
    assert result.profile_summary


def test_missing_rand36_noted_in_detailed():
    result = build_profile(_GOAL, {"sliq": _SLIQ, "rand-36": None}, _PROFILE)
    assert "no data" in result.profile_detailed


# ---------------------------------------------------------------------------
# Missing demographics
# ---------------------------------------------------------------------------


def test_missing_demographics_uses_participant_fallback():
    result = build_profile(_GOAL, _RESPONSES, None)
    assert "participant" in result.profile_summary


def test_missing_demographics_does_not_crash():
    result = build_profile(_GOAL, {}, None)
    assert isinstance(result, ProfileResult)
    assert result.profile_summary
    assert result.rag_query


# ---------------------------------------------------------------------------
# All data missing
# ---------------------------------------------------------------------------


def test_all_missing_returns_no_data_note():
    result = build_profile(_GOAL, {}, None)
    assert "No questionnaire data available" in result.profile_summary


def test_all_missing_rag_query_still_contains_goal():
    result = build_profile(_GOAL, {}, None)
    assert _GOAL in result.rag_query


# ---------------------------------------------------------------------------
# Edge: empty answers dict
# ---------------------------------------------------------------------------


def test_empty_answers_treated_as_missing():
    result = build_profile(_GOAL, {"sliq": {"answers": {}}, "rand-36": {"answers": {}}}, _PROFILE)
    assert "No questionnaire data available" in result.profile_summary


# ---------------------------------------------------------------------------
# Unknown questionnaire slug (generic formatting)
# ---------------------------------------------------------------------------


def test_unknown_slug_appears_in_detailed():
    """Questionnaires with unknown slugs are formatted generically."""
    phq9 = {"answers": {"phq9_q1": "2", "phq9_q2": "1"}}
    result = build_profile(_GOAL, {"phq-9": phq9}, _PROFILE)
    assert "PHQ-9" in result.profile_detailed
    assert "phq9_q1: 2" in result.profile_detailed


def test_unknown_slug_count_in_summary():
    """When only unknown-slug questionnaires are present, summary notes response count."""
    phq9 = {"answers": {"phq9_q1": "2"}}
    result = build_profile(_GOAL, {"phq-9": phq9}, None)
    assert "questionnaire response" in result.profile_summary
