#!/usr/bin/env node
/**
 * Adds JSON schema validators to MongoDB collections.
 * Run once: node scripts/add-mongo-validators.js
 */
import { MongoClient } from 'mongodb';

const MONGO_URI =
  process.env.MONGO_URI ||
  `mongodb://${process.env.MONGO_USER || ''}:${process.env.MONGO_PASSWORD || ''}@${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || '27017'}/hhh?authSource=admin`;

const DB_NAME = process.env.MONGO_DB || 'hhh';

const validators = {
  habit_comments: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['commentId', 'habitId', 'userId', 'createdAt'],
      properties: {
        _id: { bsonType: 'objectId' },
        commentId: { bsonType: 'string' },
        habitId: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        createdAt: { bsonType: 'date' },
      },
    },
  },
  consents: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'consentVersion', 'consentedAt'],
      properties: {
        _id: { bsonType: 'objectId' },
        userId: { bsonType: 'string' },
        consentVersion: { bsonType: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        locale: { bsonType: ['string', 'null'], enum: ['en', 'de', 'ja', null] },
        consentedAt: { bsonType: 'date' },
      },
    },
  },
  results: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['surveyId', 'participantId', 'answers', 'completedAt'],
      additionalProperties: false,
      properties: {
        _id: { bsonType: 'objectId' },
        surveyId: { bsonType: 'string' },
        surveyTitle: { bsonType: 'string' },
        participantId: { bsonType: 'string' },
        answers: { bsonType: 'object' },
        completedAt: { bsonType: 'date' },
      },
    },
  },
  profiles: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId'],
      additionalProperties: false,
      properties: {
        _id: { bsonType: 'objectId' },
        userId: { bsonType: 'string' },
        age: { bsonType: ['int', 'double', 'null'] },
        gender: { bsonType: ['string', 'null'] },
        goals: {
          bsonType: 'array',
          items: { bsonType: 'string' },
        },
        updatedAt: { bsonType: 'date' },
      },
    },
  },
  habit_annotations: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['habitId', 'type', 'createdAt'],
      additionalProperties: false,
      properties: {
        _id: { bsonType: 'objectId' },
        habitId: { bsonType: 'string' },
        type: { enum: ['helpful', 'iDoThis'] },
        createdAt: { bsonType: 'date' },
      },
    },
  },
  admin_settings: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['key', 'value'],
      additionalProperties: false,
      properties: {
        _id: { bsonType: 'objectId' },
        key: { bsonType: 'string' },
        value: {},
        updatedAt: { bsonType: 'date' },
      },
    },
  },
};

async function main() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    for (const [collName, validator] of Object.entries(validators)) {
      const collections = await db
        .listCollections({ name: collName })
        .toArray();
      if (collections.length === 0) {
        await db.createCollection(collName, { validator });
        console.log(`✓ Created collection ${collName} with validator`);
      } else {
        await db.command({
          collMod: collName,
          validator,
          validationLevel: 'moderate',
          validationAction: 'error',
        });
        console.log(`✓ Updated validator for collection ${collName}`);
      }
    }
    console.log('Done.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
