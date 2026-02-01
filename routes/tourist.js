const express = require('express');
const router = express.Router();
const tourists = require('../data/tourists.json');

router.get('/:id', (req, res) => {
  const id = req.params.id;
  const tourist = tourists.find(t => t.id === id || t.digitalId === id);
  if (tourist) res.json({ tourist });
  else res.status(404).json({ error: "Tourist not found" });
});

module.exports = router;
