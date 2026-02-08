const axios = require("axios");

exports.getWeather = async (city) => {
  const res = await axios.get(
    `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_KEY}&units=metric`
  );

  return {
    temp: res.data.main.temp,
    condition: res.data.weather[0].description,
    wind: res.data.wind.speed,
    visibility: res.data.visibility,
  };
};
