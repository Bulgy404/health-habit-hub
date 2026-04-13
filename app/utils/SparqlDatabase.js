// =============================================================================
// Dual-schema note
// =============================================================================
// This file writes donation data into the **old RDF/Fuseki (SPARQL) schema**
// using the hhh namespace (e.g. hhh:Habit, hhh:Donor, hhh:Group1).
// It coexists with Neo4jDatabase.js which writes the same schema into Neo4j
// via n10s, and with habitDonationService.js which writes the newer
// direct-Cypher schema (Habit, Context, BCIOConcept nodes).
// Run scripts/migrate-hhh-habit-to-habit.cypher to migrate old Neo4j nodes to
// the new schema.
// =============================================================================

import SparqlClient from 'sparql-http-client';
import { config } from './config.js';
import { escapeStringLiteral } from './translate.js';
import { ExperimentalSetting, Donor, Donation } from '../models/donation.js';

class SparqlDbClient {
  constructor(config) {
    this.client = new SparqlClient({
      updateUrl: config.getDbEndpoint(),
      user: config.db.user,
      password: config.db.password,
      headers: config.getDbHeader(),
    });
  }

  /** Delegate to the shared escapeStringLiteral utility (M4). */
  _esc(str) {
    return escapeStringLiteral(str);
  }

  async insertData(query) {
    try {
      await this.client.query.update(query);
      console.log('Data inserted successfully');
    } catch (error) {
      console.error('Error inserting data:', error.message);
    }
  }

  async insertDonateData(data, userId) {
    // NOTE: NORMALIZE_LANG is hardcoded to 'en' as the canonical storage language.
    const NORMALIZE_LANG = 'en';

    const mustTranslate = !data.language
      .toLowerCase()
      .startsWith(NORMALIZE_LANG);
    const experimentalSetting = new ExperimentalSetting(data.experimentGroup);
    const donation = new Donation(
      data.inputValue,
      data.language,
      data.contexts,
      userId,
      parseInt(data.habitStrength, 10)
    );
    const donor = new Donor(donation);
    let insertQuery = '';

    if (mustTranslate) {
      await donation.translate(
        NORMALIZE_LANG,
        config.getTranslateApiEndpoint()
      );
    }

    insertQuery = this.addExperimentalSetting(insertQuery, experimentalSetting);
    insertQuery = this.addHabit(insertQuery, donation);
    insertQuery = this.addDonor(insertQuery, donor, userId);

    if (donation.translation) {
      insertQuery = this.addHabit(insertQuery, donation.translation);
    }

    if (donation.hasLabels()) {
      insertQuery = this.addContext(insertQuery, donation, experimentalSetting);
      insertQuery = this.addBehavior(
        insertQuery,
        donation,
        experimentalSetting
      );
    }

    insertQuery = this.addEnvelope(insertQuery);

    await this.insertData(insertQuery);
  }

  addEnvelope(query) {
    return (
      `
      PREFIX hhh: <http://example.com/hhh#>
      PREFIX owl: <http://www.w3.org/2002/07/owl#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX xml: <http://www.w3.org/XML/1998/namespace>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      BASE <http://www.w3.org/2002/07/owl#>

      INSERT DATA {
    ` +
      query +
      '}'
    );
  }

  addExperimentalSetting(query, experimentalSetting) {
    return (query += `
      hhh:ExperimentalSetting-${experimentalSetting.id} rdf:type owl:NamedIndividual ,
        hhh:${experimentalSetting.group}.
    `);
  }

  addDonor(query, donor, userId) {
    return (query += `
      hhh:Donor-${donor.id} rdf:type owl:NamedIndividual , hhh:Donor ;
        hhh:donates hhh:Habit-${donor.donation.id} ; hhh:userId "${this._esc(userId)}"^^xsd:token ;
        hhh:id "${donor.id}"^^xsd:token .
    `);
  }

  addHabit(query, donation) {
    const behaviors = donation.labels.filter(
      (label) => label.type === 'behavior'
    );
    const behaviorStatement =
      behaviors && behaviors.length > 0
        ? `hhh:hasBehavior ${behaviors.map((behavior) => `hhh:Behavior-${behavior.id}`).join(', ')} ;`
        : '';
    return (query += `
      hhh:Habit-${donation.id} rdf:type owl:NamedIndividual , hhh:Habit ;
        ${behaviorStatement}
        hhh:habitStrength "${donation.habitStrength}"^^xsd:integer ;
        hhh:id "${donation.id}"^^xsd:token ;
        hhh:language "${this._esc(donation.language)}" ;
        hhh:source "${this._esc(donation.source)}"^^rdfs:Literal ;
        hhh:value "${this._esc(donation.value)}" .
    `);
  }

  addContext(query, donation, experimentalSetting) {
    if (donation.translation) {
      return (
        query +
        this._appendContext(
          donation,
          donation.translation,
          experimentalSetting
        ) +
        this._appendContext(donation.translation, donation, experimentalSetting)
      );
    }

    return (
      query +
      this._appendContext(donation, donation.translation, experimentalSetting)
    );
  }

  _appendContext(donation, translatedDonation, experimentalSetting) {
    return donation.labels
      .filter((label) => label.type === 'context')
      .map((context) => {
        const ALLOWED_CONTEXT_TYPES = new Set([
          'Habit',
          'Context',
          'Behavior',
          'Setting',
          'Mechanism',
          'Target',
          'Goal',
          'Causal',
        ]);
        if (!ALLOWED_CONTEXT_TYPES.has(context.value)) {
          throw new Error(`Unknown SPARQL label type: ${context.value}`);
        }
        const translation = translatedDonation
          ? translatedDonation.labels
              .filter((label) => label.type === 'context')
              .find((label) => label.value === context.value)
          : undefined;
        const translationStatement = translation
          ? `hhh:hasTranslation hhh:Context-${translation.id} ;`
          : '';
        return `
          hhh:Context-${context.id} rdf:type owl:NamedIndividual , hhh:${context.value};
            ${translationStatement}
            hhh:partOf hhh:ExperimentalSetting-${experimentalSetting.id} ;
            hhh:id "${context.id}"^^xsd:token ;
            hhh:language "${this._esc(donation.language)}" ;
            hhh:source "${this._esc(donation.source)}"^^rdfs:Literal ;
            hhh:value "${this._esc(context.data)}" .
          `;
      })
      .join('');
  }

  addBehavior(query, donation, experimentalSetting) {
    if (donation.translation) {
      return (
        query +
        this._appendBehavior(
          donation,
          donation.translation,
          experimentalSetting
        ) +
        this._appendBehavior(
          donation.translation,
          donation,
          experimentalSetting
        )
      );
    }

    return (
      query +
      this._appendBehavior(donation, donation.translation, experimentalSetting)
    );
  }

  _appendBehavior(donation, translatedDonation, experimentalSetting) {
    const contextStatement = donation.labels
      .filter((label) => label.type === 'context')
      .map((context) => `hhh:Context-${context.id}`)
      .join(' , ');
    return donation.labels
      .filter((label) => label.type === 'behavior')
      .map((behavior) => {
        const ALLOWED_BEHAVIOR_TYPES = new Set([
          'Habit',
          'Context',
          'Behavior',
          'Setting',
          'Mechanism',
          'Target',
          'Goal',
          'Causal',
        ]);
        if (!ALLOWED_BEHAVIOR_TYPES.has(behavior.value)) {
          throw new Error(`Unknown SPARQL label type: ${behavior.value}`);
        }
        const translation = translatedDonation
          ? translatedDonation.labels
              .filter((label) => label.type === 'behavior')
              .find((label) => label.value === behavior.value)
          : undefined;
        const translationStatement = translation
          ? `hhh:hasTranslation hhh:Behavior-${translation.id} ;`
          : '';
        const maybeHasContext = contextStatement
          ? `hhh:hasContext ${contextStatement} ;\n            `
          : '';
        return `
          hhh:Behavior-${behavior.id} rdf:type owl:NamedIndividual , hhh:Behavior;
            ${maybeHasContext}${translationStatement}
            hhh:partOf hhh:ExperimentalSetting-${experimentalSetting.id} ;
            hhh:id "${behavior.id}"^^xsd:token ;
            hhh:language "${this._esc(donation.language)}" ;
            hhh:source "${this._esc(donation.source)}"^^rdfs:Literal ;
            hhh:value "${this._esc(behavior.data)}" .
          `;
      })
      .join('');
  }
}

export { SparqlDbClient };
