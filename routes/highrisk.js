const express = require('express');
const router = express.Router();

// Example high-risk zones
        const zones = [
          { name: "Zone A", lat: 11.7488, lng: 79.7479, radius: 500, type: "high" },
          { name: "Zone B", lat: 11.7379, lng: 79.7390, radius: 700, type: "low" },
          { name: "Zone C", lat: 11.9217, lng: 79.6107, radius: 500, type: "high" },
          { name: "Zone D", lat: 11.9192, lng: 79.6097, radius: 700, type: "low" },
          {name: "Near Chennai Institute of Technology", lat: 12.9416, lng: 80.0869, radius: 400, type: "high"}
        ];

router.get('/', (req, res) => res.json(zones));

module.exports = router;
