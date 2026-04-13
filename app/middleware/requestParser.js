import bodyParser from 'body-parser';

// Middleware to parse JSON data in the request body
const jsonBodyParser = bodyParser.json({ limit: '100kb' });

// Export the middleware
export { jsonBodyParser };
