// Scientific references backing behaviour-change / habit-formation claims made
// on the marketing site. Cited inline via <Cite ids={[...]} /> and listed in
// full via <References ids={[...]} />. Order here fixes the footnote numbers,
// so append new entries at the end rather than reordering existing ones.
export type RefId =
  | 'srhi'
  | 'habit-automaticity'
  | 'habit-review'
  | 'bct-taxonomy'
  | 'research-practice-gap'
  | 'context-tailoring'
  | 'just-in-time-fading'
  | 'jitai'
  | 'app-bct-gap'
  | 'hrs-review';

export interface Reference {
  id: RefId;
  citation: string;
  url: string;
  /** One of the Health Habit Hub team's own peer-reviewed papers. */
  own?: boolean;
}

export const references: Reference[] = [
  {
    id: 'srhi',
    citation: 'Verplanken, B., & Orbell, S. (2003). Reflections on past behavior: A self-report index of habit strength. Journal of Applied Social Psychology, 33(6), 1313–1330.',
    url: 'https://doi.org/10.1111/j.1559-1816.2003.tb01951.x',
  },
  {
    id: 'habit-automaticity',
    citation: 'Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. European Journal of Social Psychology, 40(6), 998–1009.',
    url: 'https://doi.org/10.1002/ejsp.674',
  },
  {
    id: 'habit-review',
    citation: 'Wood, W., & Rünger, D. (2016). Psychology of habit. Annual Review of Psychology, 67, 289–314.',
    url: 'https://doi.org/10.1146/annurev-psych-122414-033417',
  },
  {
    id: 'bct-taxonomy',
    citation: 'Michie, S., Richardson, M., Johnston, M., Abraham, C., Francis, J., Hardeman, W., Eccles, M. P., Cane, J., & Wood, C. E. (2013). The behavior change technique taxonomy (v1) of 93 hierarchically clustered techniques. Annals of Behavioral Medicine, 46(1), 81–95.',
    url: 'https://doi.org/10.1007/s12160-013-9486-6',
  },
  {
    id: 'research-practice-gap',
    citation: 'Reinsch, F., Sitzberger, M. L., Kählig, M., & Stark, J. (2026). Built for sprints, needed for marathons: Mapping the gap between science, users, and implementation in digital habit formation apps. Proceedings of the European Conference on Information Systems (ECIS).',
    url: 'https://aisel.aisnet.org/ecis2026/hit/hit/14',
    own: true,
  },
  {
    id: 'context-tailoring',
    citation: 'Reinsch, F., Weimann, T. G., & Stark, J. (2024). Tailoring health: Contextual variables in health recommender systems. HealthRecSys Workshop, ACM RecSys.',
    url: 'https://ceur-ws.org/Vol-3823/1_Reinsch_tailoring_159.pdf',
    own: true,
  },
  {
    id: 'just-in-time-fading',
    citation: 'Reinsch, F., Weimann, T., & Stark, J. (2025). From instant cues to fading views: Piloting just-in-time and fading strategies in digital habit formation. Proceedings of the Americas Conference on Information Systems (AMCIS).',
    url: 'https://aisel.aisnet.org/amcis2025/health_it/sig_health/5',
    own: true,
  },
  {
    id: 'jitai',
    citation: 'Nahum-Shani, I., Smith, S. N., Spring, B. J., Collins, L. M., Witkiewitz, K., Tewari, A., & Murphy, S. A. (2018). Just-in-time adaptive interventions (JITAIs) in mobile health: Key components and design principles for ongoing health behavior support. Annals of Behavioral Medicine, 52(6), 446–462.',
    url: 'https://doi.org/10.1007/s12160-016-9830-8',
  },
  {
    id: 'app-bct-gap',
    citation: 'Middelweerd, A., Mollee, J. S., van der Wal, C. N., Brug, J., & te Velde, S. J. (2014). Apps to promote physical activity among adults: A review and content analysis. International Journal of Behavioral Nutrition and Physical Activity, 11, 97.',
    url: 'https://doi.org/10.1186/s12966-014-0097-9',
  },
  {
    id: 'hrs-review',
    citation: 'De Croon, R., Van Houdt, L., Htun, N. N., Štiglic, G., Vanden Abeele, V., & Verbert, K. (2021). Health recommender systems: Systematic review. Journal of Medical Internet Research, 23(6), e18035.',
    url: 'https://doi.org/10.2196/18035',
  },
];

/**
 * Footnote numbers are per-page, not global: each page passes its own
 * ordered list of RefIds (its "reference order"), and a citation's number is
 * just that id's position in the list. This keeps every page's footnotes
 * starting at 1, regardless of how many other pages cite the same source.
 */
export function pageRefNumber(order: RefId[], id: RefId): number {
  return order.indexOf(id) + 1;
}
