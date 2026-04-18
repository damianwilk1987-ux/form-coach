exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { imageBase64, exercise, angles } = JSON.parse(event.body);

  const exerciseGuides = {
    squat: {
      name: "Przysiad",
      angleInfo: `
        - kąt_kolana_lewe / kąt_kolana_prawe: prawidłowo 70-100° w dolnej pozycji
        - kąt_biodra: prawidłowo 70-110° w dolnej pozycji  
        - kąt_tułowia (odchylenie od pionu): prawidłowo max 30-40°
        - kąt_kostki: prawidłowo 70-90°
      `,
      focus: "kolana (czy nie zapadają do środka), głębokość przysiadu, wyprostowanie pleców, pięty na podłodze",
    },
    pushup: {
      name: "Pompki",
      angleInfo: `
        - kąt_łokcia_lewy / kąt_łokcia_prawy: prawidłowo ~90° w dolnej pozycji
        - kąt_biodra: prawidłowo 170-180° (proste ciało)
        - kąt_ramienia (bark-łokieć-nadgarstek): prawidłowo 45-60° od tułowia
      `,
      focus: "linia ciała (biodra nie opadają/nie unoszą się), kąt łokci, pozycja głowy",
    },
    lunge: {
      name: "Wykrok",
      angleInfo: `
        - kąt_kolana_przedniego: prawidłowo ~90°
        - kąt_kolana_tylnego: prawidłowo ~90°
        - kąt_tułowia: prawidłowo pionowo (170-180°)
        - kąt_biodra_przedniego: prawidłowo ~90°
      `,
      focus: "kolano nie wychodzi poza palce, tułów pionowy, stabilność bioder",
    },
    plank: {
      name: "Deska (Plank)",
      angleInfo: `
        - kąt_biodra: prawidłowo 170-180° (proste ciało)
        - kąt_łokcia: prawidłowo ~90°
        - kąt_tułowia: prawidłowo bliski 0° (poziomo)
        - kąt_szyi: prawidłowo neutralny (przedłużenie kręgosłupa)
      `,
      focus: "biodra nie opadają/nie unoszą się, napięcie core, pozycja łopatek i głowy",
    },
    pullup: {
      name: "Podciąganie",
      angleInfo: `
        - kąt_łokcia_lewy / kąt_łokcia_prawy: w górze ~45°, w dole ~170°
        - kąt_ramienia (bark): w górze ~45°, w dole ~180°
        - kąt_tułowia: prawidłowo pionowo
      `,
      focus: "pełny zakres ruchu, pozycja łopatek, brak bujania tułowiem",
    },
  };

  const guide = exerciseGuides[exercise] || exerciseGuides.squat;

  const anglesText = angles
    ? Object.entries(angles)
        .map(([k, v]) => `${k}: ${v}°`)
        .join(", ")
    : "brak danych o kątach";

  const prompt = `Jesteś precyzyjnym trenerem personalnym analizującym technikę ćwiczenia: ${guide.name}.

ZMIERZONE KĄTY STAWÓW (przez MediaPipe):
${anglesText}

WARTOŚCI REFERENCYJNE:
${guide.angleInfo}

SKUP SIĘ NA: ${guide.focus}

Na podstawie zdjęcia ORAZ danych liczbowych podaj 3-5 konkretnych wskazówek po polsku.
Cytuj konkretne kąty gdy są nieprawidłowe (np. "Kolano lewe: 115° — za mało zgięte, zejdź niżej").
Używaj emoji. Bądź konkretny i zwięzły.
Format: lista punktów, każdy punkt w nowej linii zaczynający się od emoji.`;

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
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: imageBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (data.error) {
      return { statusCode: 500, body: JSON.stringify({ error: data.error.message }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: data.content[0].text }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
