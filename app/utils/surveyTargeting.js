export const SURVEY_TARGET_MODES = new Set([
  'all_participants',
  'unassigned_only',
  'group_assigned',
]);

export function normalizeSurveyTargetMode(survey) {
  if (SURVEY_TARGET_MODES.has(survey?.targetMode)) {
    return survey.targetMode;
  }
  if (survey?.type === 'habit-donation') {
    return 'all_participants';
  }
  if (
    Array.isArray(survey?.assignedGroups) &&
    survey.assignedGroups.length > 0
  ) {
    return 'group_assigned';
  }
  return 'unassigned_only';
}

export function sanitizeSurveyTargeting({ type, targetMode, assignedGroups }) {
  const groups = Array.isArray(assignedGroups) ? assignedGroups : [];
  const normalizedTargetMode =
    type === 'habit-donation'
      ? 'all_participants'
      : targetMode ||
        (groups.length > 0 ? 'group_assigned' : 'unassigned_only');

  if (!SURVEY_TARGET_MODES.has(normalizedTargetMode)) {
    return {
      error:
        'targetMode must be all_participants, unassigned_only, or group_assigned',
    };
  }

  return {
    targetMode: normalizedTargetMode,
    assignedGroups: normalizedTargetMode === 'group_assigned' ? groups : [],
  };
}

export function canParticipantAccessSurvey(survey, participantGroup) {
  if (!survey || survey.status !== 'published') {
    return false;
  }
  if (survey.type === 'habit-donation') {
    return true;
  }

  switch (normalizeSurveyTargetMode(survey)) {
    case 'all_participants':
      return true;
    case 'unassigned_only':
      return !participantGroup;
    case 'group_assigned':
      return (
        !!participantGroup &&
        Array.isArray(survey.assignedGroups) &&
        survey.assignedGroups.includes(participantGroup)
      );
    default:
      return false;
  }
}
