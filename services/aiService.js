const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

exports.askAI = async (city, weather) => {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });



  const prompt = `
User wants to travel to ${city}.

Weather:
Temperature: ${weather.temp}°C
Condition: ${weather.condition}
Wind: ${weather.wind}
Visibility: ${weather.visibility}

Tell in simple words if it is safe to travel.
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;

  return response.text();
};
