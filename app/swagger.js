import swaggerJsdoc from 'swagger-jsdoc';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Health Habit Hub API',
      version: '1.0.0',
      description:
        'REST API for the Health Habit Hub platform. Manages participants, surveys, shared habits, recommendations, and profiles. All endpoints (except /health) require a Keycloak JWT bearer token.',
      contact: {
        name: 'HHH Development Team',
      },
      license: {
        name: 'MIT',
      },
    },
    externalDocs: {
      description:
        'Python Recommender Service OpenAPI spec (API-service/openapi.yaml)',
      url: 'https://github.com/Health-Habit-Hub/hhh/blob/master/API-service/openapi.yaml',
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server',
      },
      {
        url: 'https://hhh.example.com/api/v1',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Keycloak-issued JWT. Obtain from POST /realms/hhh/protocol/openid-connect/token',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Internal server error' },
          },
        },
        ServiceStatus: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'error'], example: 'ok' },
            latencyMs: { type: 'number', example: 12 },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'error'], example: 'ok' },
            services: {
              type: 'object',
              properties: {
                neo4j: { $ref: '#/components/schemas/ServiceStatus' },
                mongo: { $ref: '#/components/schemas/ServiceStatus' },
                keycloak: { $ref: '#/components/schemas/ServiceStatus' },
                recommender: { $ref: '#/components/schemas/ServiceStatus' },
              },
            },
          },
        },
        Participant: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid', example: 'a1b2c3d4-...' },
            username: { type: 'string', example: 'p-a1b2c3d4-...' },
            group: {
              type: 'string',
              nullable: true,
              enum: ['G1', 'G2', 'G3', 'G4', null],
              example: 'G2',
            },
            enrolledAt: { type: 'string', format: 'date-time' },
            lastActive: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            surveyCompletionPct: { type: 'number', example: 0.5 },
          },
        },
        Survey: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', example: 'Baseline Questionnaire' },
            type: { type: 'string', example: 'questionnaire' },
            status: {
              type: 'string',
              enum: ['draft', 'published', 'archived'],
              example: 'published',
            },
            assignedGroups: {
              type: 'array',
              items: { type: 'string', enum: ['G1', 'G2', 'G3', 'G4'] },
              example: ['G1', 'G2'],
            },
          },
        },
        Profile: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            answers: {
              type: 'object',
              additionalProperties: true,
              example: { age: 30, goal: 'exercise more' },
            },
            completedAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Habit: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'habit-uuid' },
            name: { type: 'string', example: 'Go for a 30-min walk daily' },
            category: { type: 'string', nullable: true, example: 'Group1' },
            bcioClass: { type: 'string', nullable: true },
            annotationCounts: {
              type: 'object',
              properties: {
                helpful: { type: 'integer', example: 5 },
                iDoThis: { type: 'integer', example: 3 },
              },
            },
          },
        },
        HabitStats: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 142 },
            byCategory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string', example: 'Group1' },
                  count: { type: 'integer', example: 42 },
                },
              },
            },
            byDay: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', example: '2026-03-15' },
                  count: { type: 'integer', example: 7 },
                },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    path.join(__dirname, 'routes', 'v1Router.js'),
    path.join(__dirname, 'routes', 'adminRouter.js'),
    path.join(__dirname, 'routes', 'admin', '*.js'),
    path.join(__dirname, 'routes', 'surveyRouter.js'),
    path.join(__dirname, 'routes', 'habitsRouter.js'),
    path.join(__dirname, 'routes', 'recommendRouter.js'),
    path.join(__dirname, 'routes', 'profileRouter.js'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
