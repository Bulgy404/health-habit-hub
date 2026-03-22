import { v4 as uuid } from 'uuid';
import { translateText } from '../utils/translate.js';

/**
 * Represents the experimental condition under which a habit was donated.
 * Group assignment:
 *   Group1 – Closed Task, Open Description
 *   Group2 – Closed Task, Closed Description
 *   Group3 – Open Task,   Closed Description
 *   Group4 – Open Task,   Open Description
 */
export class ExperimentalSetting {
  id;
  description;
  task;
  group;

  constructor(setting) {
    this.id = uuid();
    this.description = setting.closedDescription ? 'closed' : 'open';
    this.task = setting.closedTask ? 'closed' : 'open';
    if (this.isClosedTaskOpenDescription()) this.group = 'Group1';
    else if (this.isClosedTaskClosedDescription()) this.group = 'Group2';
    else if (this.isOpenTaskClosedDescription()) this.group = 'Group3';
    else if (this.isOpenTaskOpenDescription()) this.group = 'Group4';
  }

  isClosedTaskClosedDescription() {
    return this.task === 'closed' && this.description === 'closed';
  }
  isClosedTaskOpenDescription() {
    return this.task === 'closed' && this.description === 'open';
  }
  isOpenTaskOpenDescription() {
    return this.task === 'open' && this.description === 'open';
  }
  isOpenTaskClosedDescription() {
    return this.task === 'open' && this.description === 'closed';
  }
}

/** Represents the anonymous donor identity for a single donation. */
export class Donor {
  id;
  donation;
  constructor(donation) {
    this.id = uuid();
    this.donation = donation;
  }
}

/**
 * A single context or behavior label attached to a donation.
 * type: 'context' | 'behavior'
 */
export class Label {
  id;
  type;
  value;
  data;
  constructor(type, value, data) {
    this.id = uuid();
    this.type = type;
    this.value = value;
    this.data = data;
  }
}

// Static mapping of BCIO label names to their semantic type.
// Behavior is the only non-context type; all others map to 'context'.
const LABEL_TYPE_MAP = {
  TimeReference: 'context',
  PhysicalSetting: 'context',
  People: 'context',
  InternalState: 'context',
  PriorBehavior: 'context',
  Reasoning: 'context',
  Behavior: 'behavior',
};

/** Represents a donated habit sentence with optional context/behavior labels. */
export class Donation {
  id;
  value;
  labels;
  language;
  source;
  translation;
  habitStrength;

  constructor(value, language, labels, source, habitStrength) {
    this.id = uuid();
    this.value = value;
    this.language = language;
    this.labels = (labels || []).map(
      (label) => new Label(LABEL_TYPE_MAP[label.name], label.name, label.value)
    );
    this.source = source;
    const hs = parseInt(habitStrength, 10);
    this.habitStrength = Number.isFinite(hs) ? hs : 0;
  }

  hasLabels() {
    return this.labels && this.labels.length > 0;
  }

  /**
   * Translate the donation value and all label data to the target language.
   * @param {string} targetLanguage - ISO 639-1 target language code
   * @param {string} endpoint - LibreTranslate API endpoint URL
   * @returns {Promise<Donation>} A new Donation instance with translated content
   */
  async translate(targetLanguage, endpoint) {
    const translatedValue = await translateText(
      this.value,
      this.language,
      targetLanguage,
      endpoint
    );
    const translatedLabels = this.hasLabels()
      ? await Promise.all(
          this.labels.map((label) =>
            translateText(label.data, this.language, targetLanguage, endpoint)
          )
        )
      : [];

    const labelsCopy = this.labels.map((label, index) =>
      Object.assign({ name: label.value, value: translatedLabels[index] })
    );
    this.translation = new Donation(
      translatedValue,
      targetLanguage,
      labelsCopy,
      'translation',
      this.habitStrength
    );
    return this.translation;
  }
}
