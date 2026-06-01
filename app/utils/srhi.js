export const SRHI_ITEMS = [
  { id: 'srhi_1', en: 'I do frequently', de: 'das ich häufig tue' },
  { id: 'srhi_2', en: 'I do automatically', de: 'das ich automatisch tue' },
  {
    id: 'srhi_3',
    en: 'I do without having to consciously remember',
    de: 'das ich tue, ohne mich bewusst erinnern zu müssen',
  },
  {
    id: 'srhi_4',
    en: 'that makes me feel weird if I do not do it',
    de: 'bei dem ich mich komisch fühle, wenn ich es nicht tue',
  },
  {
    id: 'srhi_5',
    en: 'I do without thinking',
    de: 'das ich tue, ohne darüber nachzudenken',
  },
  {
    id: 'srhi_6',
    en: 'that would require effort not to do it',
    de: 'das mich Anstrengung kosten würde, es nicht zu tun',
  },
  {
    id: 'srhi_7',
    en: 'that belongs to my daily, weekly, or monthly routine',
    de: 'das zu meiner täglichen, wöchentlichen oder monatlichen Routine gehört',
  },
  {
    id: 'srhi_8',
    en: "I start doing before I realize I'm doing it",
    de: 'mit dem ich anfange, ohne zu bemerken, dass ich es tue',
  },
  {
    id: 'srhi_9',
    en: 'I would find hard not to do',
    de: 'das mir schwerfallen würde, es nicht zu tun',
  },
  {
    id: 'srhi_10',
    en: 'I have no need to think about doing',
    de: 'worüber ich nicht nachdenken muss, um es zu tun',
  },
  {
    id: 'srhi_11',
    en: 'that\'s typically "me"',
    de: 'das typisch für mich ist',
  },
  {
    id: 'srhi_12',
    en: 'I have been doing for a long time',
    de: 'das ich schon seit langer Zeit mache',
  },
];

export const SRHI_ITEM_IDS = SRHI_ITEMS.map((i) => i.id);

export const BEHAVIOR_OPTIONS = [
  { key: 'walking', en: 'Walking', de: 'Spazieren gehen' },
  { key: 'light_jogging', en: 'Light jogging', de: 'Leichtes Joggen' },
  { key: 'cycling', en: 'Cycling', de: 'Radfahren' },
  {
    key: 'structured_calisthenics',
    en: 'Structured calisthenics',
    de: 'Kalisteniktraining',
  },
  { key: 'yoga', en: 'Yoga', de: 'Yoga' },
];

export const DEFAULT_BEHAVIOR_KEYS = BEHAVIOR_OPTIONS.map((b) => b.key);

export const CUE_SOURCES = /** @type {const} */ ([
  'low_quality',
  'high_quality',
  'self_selected',
]);
export const CUE_COUNTS = /** @type {const} */ (['single', 'multi']);
