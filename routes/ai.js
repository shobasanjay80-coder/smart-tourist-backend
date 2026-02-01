const express = require('express');
const router = express.Router();

// Sample AI risk scoring
router.post('/risk', (req, res) => {
  const { lat, lng, itinerary } = req.body;

  // Example: random risk score
  const riskScore = Math.floor(Math.random() * 100);
  const reasons = riskScore > 70 
    ? ["High traffic area", "Reported theft nearby"] 
    : ["Normal conditions"];

  res.json({ riskScore, reasons });
});

module.exports = router;
