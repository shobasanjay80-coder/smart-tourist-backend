// routes/poi.js
const express = require('express');
const router = express.Router();

// Sample POIs
const POIS = [
  { id: '1', title: 'Heritage Monument', desc: 'Built in 1890.', lat: 12.9352, lon: 80.1146 },
  { id: '2', title: 'Town Library', desc: 'Open 9 AM - 6 PM', lat: 12.9345, lon: 80.1150 },
];

router.get('/pois', (req, res) => {
  res.json(POIS);
});

module.exports = router;
