// Scientific references backing behaviour-change / habit-formation claims made
// on the marketing site, as APA 7 reference-list entries. Cited inline via
// <Cite ids={[...]} /> and listed in full via <References ids={[...]} />. Footnote numbers come from each page's
// own `pageRefs` order (see pageRefNumber), not from the order here.
export type RefId =
  | 'srhi'
  | 'habit-automaticity'
  | 'habit-review'
  | 'bct-taxonomy'
  | 'research-practice-gap'
  | 'context-tailoring'
  | 'just-in-time-fading'
  | 'app-bct-gap'
  | 'hrs-review'
  | 'habit-promotion'
  | 'implementation-intentions'
  | 'reminder-dependency'
  | 'bcio'
  | 'self-monitoring-techniques'
  | 'progress-monitoring'
  | 'intention-behavior-gap'
  | 'behaviour-clustering'
  | 'tailoring-meta'
  | 'recsys-explanations'
  | 'reidentification'
  | 'k-anonymity'
  | 'app-attrition'
  | 'law-of-attrition'
  | 'effective-engagement';

export interface Reference {
  id: RefId;
  /** APA 7 reference-list entry, without the DOI/URL; `*…*` marks italics. */
  citation: string;
  /** DOI (as https://doi.org/…) or, where there is none, the publisher's page. */
  url: string;
}

export const references: Reference[] = [
  {
    id: 'srhi',
    citation: 'Verplanken, B., & Orbell, S. (2003). Reflections on past behavior: A self-report index of habit strength. *Journal of Applied Social Psychology, 33*(6), 1313–1330.',
    url: 'https://doi.org/10.1111/j.1559-1816.2003.tb01951.x',
  },
  {
    id: 'habit-automaticity',
    citation: 'Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. *European Journal of Social Psychology, 40*(6), 998–1009.',
    url: 'https://doi.org/10.1002/ejsp.674',
  },
  {
    id: 'habit-review',
    citation: 'Wood, W., & Rünger, D. (2016). Psychology of habit. *Annual Review of Psychology, 67*(1), 289–314.',
    url: 'https://doi.org/10.1146/annurev-psych-122414-033417',
  },
  {
    id: 'bct-taxonomy',
    citation: 'Michie, S., Richardson, M., Johnston, M., Abraham, C., Francis, J., Hardeman, W., Eccles, M. P., Cane, J., & Wood, C. E. (2013). The behavior change technique taxonomy (v1) of 93 hierarchically clustered techniques: Building an international consensus for the reporting of behavior change interventions. *Annals of Behavioral Medicine, 46*(1), 81–95.',
    url: 'https://doi.org/10.1007/s12160-013-9486-6',
  },
  {
    id: 'research-practice-gap',
    citation: 'Reinsch, F., Sitzberger, M. L., Kählig, M., & Stark, J. (2026). Built for sprints, needed for marathons: Mapping the gap between science, users, and implementation in digital habit formation apps. In *ECIS 2026 Proceedings*. Association for Information Systems.',
    url: 'https://aisel.aisnet.org/ecis2026/hit/hit/14',
  },
  {
    id: 'context-tailoring',
    citation: 'Reinsch, F., Weimann, T., & Stark, J. (2024). Tailoring health: Contextual variables in health recommender systems. In *Proceedings of the 6th International Workshop on Health Recommender Systems (HealthRecSys 2024)* (CEUR Workshop Proceedings, Vol. 3823, pp. 2–15). CEUR-WS.org.',
    url: 'https://ceur-ws.org/Vol-3823/1_Reinsch_tailoring_159.pdf',
  },
  {
    id: 'just-in-time-fading',
    citation: 'Reinsch, F., Weimann, T., & Stark, J. (2025). From instant cues to fading views: Piloting just-in-time and fading strategies in digital habit formation. In *AMCIS 2025 Proceedings*. Association for Information Systems.',
    url: 'https://aisel.aisnet.org/amcis2025/health_it/sig_health/5',
  },
  {
    id: 'app-bct-gap',
    citation: 'Middelweerd, A., Mollee, J. S., van der Wal, C. N., Brug, J., & te Velde, S. J. (2014). Apps to promote physical activity among adults: A review and content analysis. *International Journal of Behavioral Nutrition and Physical Activity, 11*(1), Article 97.',
    url: 'https://doi.org/10.1186/s12966-014-0097-9',
  },
  {
    id: 'hrs-review',
    citation: 'De Croon, R., Van Houdt, L., Htun, N. N., Štiglic, G., Vanden Abeele, V., & Verbert, K. (2021). Health recommender systems: Systematic review. *Journal of Medical Internet Research, 23*(6), Article e18035.',
    url: 'https://doi.org/10.2196/18035',
  },
  {
    id: 'habit-promotion',
    citation: 'Lally, P., & Gardner, B. (2013). Promoting habit formation. *Health Psychology Review, 7*(Suppl. 1), S137–S158.',
    url: 'https://doi.org/10.1080/17437199.2011.603640',
  },
  {
    id: 'implementation-intentions',
    citation: 'Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. *American Psychologist, 54*(7), 493–503.',
    url: 'https://doi.org/10.1037/0003-066X.54.7.493',
  },
  {
    id: 'reminder-dependency',
    citation: 'Stawarz, K., Cox, A. L., & Blandford, A. (2015). Beyond self-tracking and reminders: Designing smartphone apps that support habit formation. In *Proceedings of the 33rd Annual ACM Conference on Human Factors in Computing Systems* (pp. 2653–2662). Association for Computing Machinery.',
    url: 'https://doi.org/10.1145/2702123.2702230',
  },
  {
    id: 'bcio',
    citation: 'Michie, S., West, R., Finnerty, A. N., Norris, E., Wright, A. J., Marques, M. M., Johnston, M., Kelly, M. P., Thomas, J., & Hastings, J. (2021). Representation of behaviour change interventions and their evaluation: Development of the Upper Level of the Behaviour Change Intervention Ontology (Version 2). *Wellcome Open Research, 5*, Article 123.',
    url: 'https://doi.org/10.12688/wellcomeopenres.15902.2',
  },
  {
    id: 'self-monitoring-techniques',
    citation: 'Michie, S., Abraham, C., Whittington, C., McAteer, J., & Gupta, S. (2009). Effective techniques in healthy eating and physical activity interventions: A meta-regression. *Health Psychology, 28*(6), 690–701.',
    url: 'https://doi.org/10.1037/a0016136',
  },
  {
    id: 'progress-monitoring',
    citation: 'Harkin, B., Webb, T. L., Chang, B. P. I., Prestwich, A., Conner, M., Kellar, I., Benn, Y., & Sheeran, P. (2016). Does monitoring goal progress promote goal attainment? A meta-analysis of the experimental evidence. *Psychological Bulletin, 142*(2), 198–229.',
    url: 'https://doi.org/10.1037/bul0000025',
  },
  {
    id: 'intention-behavior-gap',
    citation: 'Sheeran, P., & Webb, T. L. (2016). The intention–behavior gap. *Social and Personality Psychology Compass, 10*(9), 503–518.',
    url: 'https://doi.org/10.1111/spc3.12265',
  },
  {
    id: 'behaviour-clustering',
    citation: 'Noble, N., Paul, C., Turon, H., & Oldmeadow, C. (2015). Which modifiable health risk behaviours are related? A systematic review of the clustering of smoking, nutrition, alcohol and physical activity (‘SNAP’) health risk factors. *Preventive Medicine, 81*, 16–41.',
    url: 'https://doi.org/10.1016/j.ypmed.2015.07.003',
  },
  {
    id: 'tailoring-meta',
    citation: 'Noar, S. M., Benac, C. N., & Harris, M. S. (2007). Does tailoring matter? Meta-analytic review of tailored print health behavior change interventions. *Psychological Bulletin, 133*(4), 673–693.',
    url: 'https://doi.org/10.1037/0033-2909.133.4.673',
  },
  {
    id: 'recsys-explanations',
    citation: 'Tintarev, N., & Masthoff, J. (2007). A survey of explanations in recommender systems. In *2007 IEEE 23rd International Conference on Data Engineering Workshop* (pp. 801–810). IEEE.',
    url: 'https://doi.org/10.1109/ICDEW.2007.4401070',
  },
  {
    id: 'reidentification',
    citation: 'Rocher, L., Hendrickx, J. M., & de Montjoye, Y.-A. (2019). Estimating the success of re-identifications in incomplete datasets using generative models. *Nature Communications, 10*(1), Article 3069.',
    url: 'https://doi.org/10.1038/s41467-019-10933-3',
  },
  {
    id: 'k-anonymity',
    citation: 'Sweeney, L. (2002). k-Anonymity: A model for protecting privacy. *International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems, 10*(5), 557–570.',
    url: 'https://doi.org/10.1142/S0218488502001648',
  },
  {
    id: 'app-attrition',
    citation: 'Meyerowitz-Katz, G., Ravi, S., Arnolda, L., Feng, X., Maberly, G., & Astell-Burt, T. (2020). Rates of attrition and dropout in app-based interventions for chronic disease: Systematic review and meta-analysis. *Journal of Medical Internet Research, 22*(9), Article e20283.',
    url: 'https://doi.org/10.2196/20283',
  },
  {
    id: 'law-of-attrition',
    citation: 'Eysenbach, G. (2005). The law of attrition. *Journal of Medical Internet Research, 7*(1), Article e11.',
    url: 'https://doi.org/10.2196/jmir.7.1.e11',
  },
  {
    id: 'effective-engagement',
    citation: 'Yardley, L., Spring, B. J., Riper, H., Morrison, L. G., Crane, D. H., Curtis, K., Merchant, G. C., Naughton, F., & Blandford, A. (2016). Understanding and promoting effective engagement with digital behavior change interventions. *American Journal of Preventive Medicine, 51*(5), 833–842.',
    url: 'https://doi.org/10.1016/j.amepre.2016.06.015',
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
