const express = require("express");
const router = express.Router();

const { getWeather } = require("../services/weatherService");
const { askAI } = require("../services/aiService");

router.get("/ai-safety/:city", async (req, res) => {
  try {
    const city = req.params.city;

    const weather = await getWeather(city);
    const answer = await askAI(city, weather);

    res.json({
      success: true,
      reply: answer,
      weather,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
