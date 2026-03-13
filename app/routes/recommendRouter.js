import express from 'express';

async function proxyToRecommender(req, res, targetUrl) {
  const headers = {};
  if (req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }
  const fetchOptions = { method: req.method, headers };
  if (req.body && Object.keys(req.body).length > 0) {
    fetchOptions.body = JSON.stringify(req.body);
    headers['Content-Type'] = 'application/json';
  }
  const upstream = await fetch(targetUrl, fetchOptions);
  const data = await upstream.json();
  res.status(upstream.status).json(data);
}

export function createRecommendRouter({ recommenderUrl } = {}) {
  const baseUrl =
    recommenderUrl || process.env.RECOMMENDER_URL || 'http://recommender:8000';
  const router = express.Router();

  // GET /api/v1/recommend/:userId/history → Python GET /recommend/:userId/history
  router.get('/:userId/history', async (req, res) => {
    await proxyToRecommender(
      req,
      res,
      `${baseUrl}/recommend/${req.params.userId}/history`
    );
  });

  // GET /api/v1/recommend/:userId → Python GET /recommend/:userId
  router.get('/:userId', async (req, res) => {
    await proxyToRecommender(
      req,
      res,
      `${baseUrl}/recommend/${req.params.userId}`
    );
  });

  // POST /api/v1/recommend/classify → Python POST /classify
  router.post('/classify', async (req, res) => {
    await proxyToRecommender(req, res, `${baseUrl}/classify`);
  });

  return router;
}

export default createRecommendRouter;
