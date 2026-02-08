const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

exports.askAI = async (city, weather) => {
  const prompt = `
User wants to travel to ${city}.

Weather:
Temperature: ${weather.temp}°C
Condition: ${weather.condition}
Wind: ${weather.wind} m/s
Visibility: ${weather.visibility}

Is it safe to travel? Give short advice.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a travel safety expert." },
      { role: "user", content: prompt },
    ],
  });

  return completion.choices[0].message.content;
};
