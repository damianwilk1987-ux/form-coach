export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { imageBase64, exercise, angles } = req.body;

  const exerciseGuides = {
    squat: { name: "Przysiad", focus: "kolana (czy nie zapadają do środka), głębokość przysiadu, wyprostowanie pleców, pięty na podłodze", angleInfo: "kolano 70-100°, biodro 70-110°, tułów max 40°" },
    pushup: { name: "Pompki", focus: "linia ciała (biodra nie opadają), kąt łokci, pozycja głowy", angleInfo: "łokieć ~90°, biodro 170-180°" },
    lunge: { name: "Wykrok", focus: "kolano nie wychodzi poza palce, tułów pionowy, stabilność", angleInfo: "kolano przednie ~90°, tułów 170-180°" },
    plank: { name: "Deska", focus: "biodra nie opadają/nie unoszą się, napięcie core, pozycja głowy", angleInfo: "biodro 170-180°, łokieć ~90°" },
    pullup: { name: "Podciąganie", focus: "pełny zakres ruchu, pozycja łopatek, brak bujania", angleInfo: "łokieć w górze ~45°, w dole ~170°" },
  };

  const guide = exerciseGuides[exercise] || exerciseGuides.squat;
  const anglesText = angles ? Object.entries(angles).map(([k, v]) => `${k}: ${v}°`).join(", ") : "brak danych";

  const prompt = `Jesteś precyzyjnym trenerem personalnym analizującym technikę ćwiczenia: ${guide.name}.

ZMIERZONE KĄTY STAWÓW: ${anglesText}
WARTOŚCI REFERENCYJNE: ${guide.angleInfo}
SKUP SIĘ NA: ${guide.focus}

Podaj 3-5 konkretnych wskazówek po polsku. Cytuj kąty gdy są nieprawidłowe. Używaj emoji. Format: lista punktów.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.status(200).json({ feedback: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
