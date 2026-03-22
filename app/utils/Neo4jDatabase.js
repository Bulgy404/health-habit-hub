// =============================================================================
// Dual-schema note
// =============================================================================
// This file writes donation data into the **old RDF/n10s schema** using the
// hhh__ namespace (e.g. hhh__Habit, hhh__Donor, hhh__Group1).  The newer
// direct-Cypher schema (Habit, Context, BCIOConcept nodes written by
// habitDonationService.js) coexists in the same Neo4j database.
// Run scripts/migrate-hhh-habit-to-habit.cypher to migrate old nodes to the
// new schema.  See neo4j/init/constraints.cypher for the full index/constraint
// definitions for both schemas.
// =============================================================================

import neo4j from 'neo4j-driver';
import { v4 as uuid } from 'uuid';
import { escapeStringLiteral } from './translate.js';
import { ExperimentalSetting, Donation } from '../models/donation.js';

// ---------------------------------------------------------------------------
// RDF namespace constants — defined once at module level (not per-call).
// ---------------------------------------------------------------------------
const HHH_NS = 'http://example.com/hhh#';

/** Build a full IRI reference from a local name in the hhh namespace. */
const iri = (local) => `<${HHH_NS}${local}>`;

/**
 * Turtle prefix block shared across all import payloads.
 * Extracted as a named constant so the namespace URI appears in exactly
 * one place (see HHH_NS above).
 */
const PREFIXES = `@prefix hhh: <${HHH_NS}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix xml: <http://www.w3.org/XML/1998/namespace> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
`;

// ---------------------------------------------------------------------------
// Neo4j client
// ---------------------------------------------------------------------------

class Neo4jDbClient {
  constructor(config) {
    this.config = config;
    this.driver = neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
    );
    this.n10sConfigured = false;
  }

  /** Delegate to the shared escapeStringLiteral utility (M4). */
  _esc(str) {
    return escapeStringLiteral(str);
  }

  async close() {
    await this.driver.close();
  }

  async ensureN10sConfigured() {
    if (this.n10sConfigured) return;
    const session = this.driver.session({
      defaultAccessMode: neo4j.session.WRITE,
    });
    try {
      try {
        await session.run(
          `CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS FOR (r:Resource) REQUIRE r.uri IS UNIQUE`
        );
      } catch {
        // constraint may already exist
      }

      await session.run(
        `CALL n10s.graphconfig.init({ handleVocabUris: 'SHORTEN', keepLangTag: true, handleMultival: 'ARRAY' })`
      );
    } catch {
      // already configured — ignore
    }

    try {
      await session.run(`CALL n10s.nsprefixes.add($prefix,$ns)`, {
        prefix: 'hhh',
        ns: HHH_NS,
      });
    } catch {
      // ignore
    }

    try {
      await session.run(`CALL n10s.rdf.import.fetch($url,'Turtle')`, {
        url: 'file:///import/Ontology.ttl',
      });
    } catch {
      // ontology import is best-effort
    } finally {
      await session.close();
    }
    this.n10sConfigured = true;
  }

  async insertDonateData(data, userId) {
    const NORMALIZE_LANG = 'en';
    await this.ensureN10sConfigured();

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
    const timestamp = new Date().toISOString();

    if (mustTranslate) {
      await donation.translate(
        NORMALIZE_LANG,
        this.config.getTranslateApiEndpoint()
      );
    }

    const parts = this._buildDonationTurtle(
      donation,
      experimentalSetting,
      userId,
      timestamp
    );

    const session = this.driver.session({
      defaultAccessMode: neo4j.session.WRITE,
    });
    try {
      await this._importTurtle(
        session,
        parts.prefixes +
          parts.experimentalSettingTriples +
          parts.habitTriples +
          parts.donorTriples,
        'base+habit'
      );
      if (parts.contextTriples)
        await this._importTurtle(
          session,
          parts.prefixes + parts.contextTriples,
          'contexts'
        );
      if (parts.behaviorTriples || parts.habitBehaviorLinks)
        await this._importTurtle(
          session,
          parts.prefixes + parts.behaviorTriples + parts.habitBehaviorLinks,
          'behaviors+links'
        );
      if (parts.translationTriples)
        await this._importTurtle(
          session,
          parts.prefixes + parts.translationTriples,
          'translations'
        );
    } finally {
      await session.close();
    }
  }

  /** Call n10s.rdf.import.inline and log a detailed error on non-OK status. */
  async _importTurtle(session, payload, label) {
    const res = await session.run(
      `CALL n10s.rdf.import.inline($payload, 'Turtle')`,
      { payload }
    );
    const first = res.records?.[0]?.toObject?.() ?? {};
    const status =
      first.terminationStatus || first['terminationStatus'] || 'UNKNOWN';
    if (status !== 'OK') {
      console.error(
        `[n10s] Import failed — label: ${label}, status: ${status}, payload (first 200 chars): ${payload.slice(0, 200)}`
      );
    }
    return status === 'OK';
  }

  // ---------------------------------------------------------------------------
  // Turtle building — each section is a dedicated named method (M1).
  // ---------------------------------------------------------------------------

  _habitTriples(donation) {
    return `
${iri(`Habit-${donation.id}`)} rdf:type owl:NamedIndividual , hhh:Habit ;
  hhh:habitStrength "${donation.habitStrength}"^^xsd:integer ;
  hhh:id "${donation.id}"^^xsd:string ;
  hhh:language "${this._esc(donation.language)}" ;
  hhh:source "${this._esc(donation.source)}"^^xsd:string ;
  hhh:value "${this._esc(donation.value)}" .
`;
  }

  _experimentalSettingTriples(setting) {
    return `
${iri(`ExperimentalSetting-${setting.id}`)} rdf:type owl:NamedIndividual , hhh:${setting.group} .
`;
  }

  _donorTriples(donorId, donation, userId, timestamp) {
    return `
${iri(`Donor-${donorId}`)} rdf:type owl:NamedIndividual , hhh:Donor ;
  hhh:donates ${iri(`Habit-${donation.id}`)} ;
  hhh:userId "${userId}"^^xsd:string ;
  hhh:timestamp "${timestamp}"^^xsd:dateTime ;
  hhh:id "${donorId}"^^xsd:string .
`;
  }

  _contextTriples(donation, setting) {
    const contexts = donation.labels.filter((l) => l.type === 'context');
    return contexts
      .map(
        (c) => `
${iri(`Context-${c.id}`)} rdf:type owl:NamedIndividual , hhh:${c.value} ;
  hhh:partOf ${iri(`ExperimentalSetting-${setting.id}`)} ;
  hhh:id "${c.id}"^^xsd:string ;
  hhh:language "${this._esc(donation.language)}" ;
  hhh:source "${this._esc(donation.source)}"^^xsd:string ;
  hhh:value "${this._esc(c.data)}" .
`
      )
      .join('');
  }

  /** Returns { behaviorTriples, habitBehaviorLinks }. */
  _behaviorContent(donation, setting) {
    const contexts = donation.labels.filter((l) => l.type === 'context');
    const behaviors = donation.labels.filter((l) => l.type === 'behavior');

    const behaviorTriples = behaviors
      .map((b) => {
        const ctxList = contexts.map((c) => iri(`Context-${c.id}`)).join(' , ');
        const hasCtx = ctxList ? `\n  hhh:hasContext ${ctxList} ;` : '';
        return `
${iri(`Behavior-${b.id}`)} rdf:type owl:NamedIndividual , hhh:Behavior ;${hasCtx}
  hhh:partOf ${iri(`ExperimentalSetting-${setting.id}`)} ;
  hhh:id "${b.id}"^^xsd:string ;
  hhh:language "${this._esc(donation.language)}" ;
  hhh:source "${this._esc(donation.source)}"^^xsd:string ;
  hhh:value "${this._esc(b.data)}" .
`;
      })
      .join('');

    const habitBehaviorLinks = behaviors.length
      ? `${iri(`Habit-${donation.id}`)} hhh:hasBehavior ${behaviors
          .map((b) => iri(`Behavior-${b.id}`))
          .join(' , ')} .
`
      : '';

    return { behaviorTriples, habitBehaviorLinks };
  }

  _translationTriples(donation, setting) {
    if (!donation.translation) return '';
    const t = donation.translation;
    let triples = `
${iri(`Habit-${donation.id}`)} hhh:hasTranslation ${iri(`Habit-${t.id}`)} .
${iri(`Habit-${t.id}`)} hhh:hasTranslation ${iri(`Habit-${donation.id}`)} .
${iri(`Habit-${t.id}`)} rdf:type owl:NamedIndividual , hhh:Habit ;
  hhh:habitStrength "${t.habitStrength}"^^xsd:integer ;
  hhh:id "${t.id}"^^xsd:string ;
  hhh:language "${this._esc(t.language)}" ;
  hhh:source "${this._esc(t.source)}"^^xsd:string ;
  hhh:value "${this._esc(t.value)}" .
`;

    const origContexts = donation.labels.filter((l) => l.type === 'context');
    const origBehaviors = donation.labels.filter((l) => l.type === 'behavior');
    const translatedLabelsByValue = new Map(t.labels.map((l) => [l.value, l]));

    triples += origContexts
      .map((origCtx) => {
        const tid = uuid();
        const tLabel = translatedLabelsByValue.get(origCtx.value);
        const translatedData = tLabel ? tLabel.data : origCtx.data;
        return `
${iri(`Context-${tid}`)} rdf:type owl:NamedIndividual , hhh:${origCtx.value} ;
  hhh:partOf ${iri(`ExperimentalSetting-${setting.id}`)} ;
  hhh:id "${tid}"^^xsd:string ;
  hhh:language "${this._esc(t.language)}" ;
  hhh:source "${this._esc(t.source)}"^^xsd:string ;
  hhh:value "${this._esc(translatedData)}" .
${iri(`Context-${origCtx.id}`)} hhh:hasTranslation ${iri(`Context-${tid}`)} .
${iri(`Context-${tid}`)} hhh:hasTranslation ${iri(`Context-${origCtx.id}`)} .
`;
      })
      .join('');

    triples += origBehaviors
      .map((origBeh) => {
        const tid = uuid();
        const tLabel = translatedLabelsByValue.get(origBeh.value);
        const translatedData = tLabel ? tLabel.data : origBeh.data;
        return `
${iri(`Behavior-${tid}`)} rdf:type owl:NamedIndividual , hhh:Behavior ;
  hhh:partOf ${iri(`ExperimentalSetting-${setting.id}`)} ;
  hhh:id "${tid}"^^xsd:string ;
  hhh:language "${this._esc(t.language)}" ;
  hhh:source "${this._esc(t.source)}"^^xsd:string ;
  hhh:value "${this._esc(translatedData)}" .
${iri(`Behavior-${origBeh.id}`)} hhh:hasTranslation ${iri(`Behavior-${tid}`)} .
${iri(`Behavior-${tid}`)} hhh:hasTranslation ${iri(`Behavior-${origBeh.id}`)} .
`;
      })
      .join('');

    return triples;
  }

  /**
   * Orchestrates building all Turtle sections for a donation.
   * Each section is produced by a dedicated named method.
   */
  _buildDonationTurtle(donation, experimentalSetting, userId, timestamp) {
    const donorId = uuid();
    return {
      prefixes: PREFIXES,
      habitTriples: this._habitTriples(donation),
      experimentalSettingTriples:
        this._experimentalSettingTriples(experimentalSetting),
      donorTriples: this._donorTriples(donorId, donation, userId, timestamp),
      contextTriples: this._contextTriples(donation, experimentalSetting),
      ...this._behaviorContent(donation, experimentalSetting),
      translationTriples: this._translationTriples(
        donation,
        experimentalSetting
      ),
    };
  }
}

export { Neo4jDbClient };
