export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { imageBase64, exercise, angles, mode, visiblePoints, previousFeedback, repCount, phase } = req.body;

  const exerciseGuides = {
    squat: { name: "Przysiad", focus: "kolana (czy nie zapadają do środka — prowadź je nad palce stóp), wyprostowanie pleców, pięty na podłodze. Głębokość przysiadu jest DOBRA jeśli kolano jest poniżej 90° — NIE mów żeby schodzić niżej gdy kąt kolana jest już poniżej 100°", angleInfo: "kolano 55-120° (poniżej 90° = głęboki przysiad — DOBRZE), biodro 50-125°" },
    pushup: { name: "Pompki", focus: "linia ciała (biodra nie opadają), kąt łokci, pozycja głowy", angleInfo: "łokieć ~90°, biodro 170-180°" },
    lunge: { name: "Wykrok", focus: "kolano nie wychodzi poza palce, tułów pionowy, stabilność", angleInfo: "kolano przednie ~90°, tułów 170-180°" },
    plank: { name: "Deska", focus: "biodra nie opadają/nie unoszą się, napięcie core, pozycja głowy", angleInfo: "biodro 170-180°, łokieć ~90°" },
    pullup: { name: "Podciąganie", focus: "pełny zakres ruchu, pozycja łopatek, brak bujania", angleInfo: "łokieć w górze ~45°, w dole ~170°" },
  };

  const guide = exerciseGuides[exercise] || exerciseGuides.squat;
  const anglesText = angles ? Object.entries(angles).map(([k, v]) => `${k}: ${v}°`).join(", ") : "brak danych";
  const isSummary = mode === "summary";
  const isError = mode === "error";

  let prompt;

  if (isSummary) {
    prompt = `Jesteś trenerem personalnym. Podsumuj serię ${repCount || ""} powtórzeń ćwiczenia ${guide.name} po polsku. Maksymalnie 15 słów. Przykłady: "Dobra seria, ${repCount} powtórzeń z dobrą techniką!", "Następnym razem zejdź głębiej w przysiadzie." Tylko jedno zdanie, bez emoji.`;
  } else if (isError) {
    prompt = `Jesteś trenerem personalnym. Wykryto błąd techniczny podczas ćwiczenia ${guide.name}.
KĄTY: ${anglesText}
NORMY: ${guide.angleInfo}
WAŻNE: Kąt kolana poniżej 90° oznacza GŁĘBOKI PRZYSIAD — to jest DOBRZE, nie błąd.
Powiedz JEDNO krótkie zdanie po polsku max 8 słów wskazując konkretny błąd tylko jeśli naprawdę istnieje. Np: "Kolano opada do środka, popraw ustawienie." Bez emoji.`;
  } else if (phase === "early") {
    prompt = `Jesteś trenerem personalnym oceniającym pierwsze ${repCount} powtórzenia ćwiczenia ${guide.name}.
KĄTY STAWÓW: ${anglesText}
NORMY: ${guide.angleInfo}
SKUP SIĘ NA: ${guide.focus}
WAŻNE: Kąt kolana poniżej 90° to głęboki przysiad — CHWAL, nie krytykuj.
Podaj szczegółowy feedback po polsku — oceń każdy aspekt techniki. Maksymalnie 2 zdania, łącznie max 20 słów. Np: "Kolana do zewnątrz, plecy prawidłowo. Zejdź głębiej w przysiadzie." Bez emoji.`;
  } else if (phase === "check") {
    prompt = `Jesteś trenerem personalnym. Ćwiczący wykonał już ${repCount} powtórzeń ${guide.name}.
POPRZEDNIA WSKAZÓWKA: "${previousFeedback}"
AKTUALNE KĄTY: ${anglesText}
NORMY: ${guide.angleInfo}
WAŻNE: Kąt kolana poniżej 90° to głęboki przysiad — CHWAL, nie krytykuj.
Oceń czy zastosował poprzednią wskazówkę. Jedno zdanie max 10 słów. Np: "Świetnie, kolana już prawidłowo ustawione!" lub "Nadal schodzisz za płytko, zegnij bardziej." Bez emoji.`;
  } else {
    prompt = `Wykryto ${visiblePoints || 0} z 33 punktów ciała. Jeśli mniej niż 20 powiedz tylko: "Odejdź od kamery, ustaw całe ciało w kadrze." Bez emoji. Jedno zdanie.`;
  }

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
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: (isSummary || isError || phase === "check")
              ? [{ type: "text", text: prompt }]
              : [
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
