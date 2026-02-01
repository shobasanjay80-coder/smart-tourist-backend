// routes/sos.js
const express = require('express');
const router = express.Router();

// Temporary in-memory store for SOS alerts
const sosAlerts = [];

/**
 * POST /api/sos
 * Body: { touristId, lat, lng }
 */
router.post('/', (req, res) => {
  const { touristId, lat, lng } = req.body;

  if (!touristId || lat == null || lng == null) {
    return res.status(400).json({ error: "touristId, lat, and lng are required" });
  }

  const sosEntry = { touristId, lat, lng, timestamp: new Date() };
  sosAlerts.push(sosEntry);

  console.log("SOS received:", sosEntry);

  res.json({ success: true, message: "SOS sent successfully", sos: sosEntry });
});

/**
 * GET /api/sos
 * Optional: view all SOS alerts
 */
router.get('/', (req, res) => {
  res.json(sosAlerts);
});

module.exports = router;
