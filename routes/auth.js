const express = require('express');
const router = express.Router();
const tourists = require('../data/tourists.json');

router.post('/login', (req, res) => {
  const { digitalId } = req.body;
  const tourist = tourists.find(t => t.digitalId === digitalId);
  if (tourist) res.json({ tourist });
  else res.status(404).json({ error: "Digital ID not found" });
});

module.exports = router;
