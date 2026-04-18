export function calcAngle(a, b, c) {
  const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs((rad * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
}

export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT: 31, RIGHT_FOOT: 32,
};

export function getAngles(landmarks, exercise) {
  if (!landmarks || landmarks.length < 33) return {};
  const lm = landmarks;
  const angles = {};
  const get = (idx) => lm[idx];
  try {
    switch (exercise) {
      case "squat":
        angles["kolano_lewe"] = calcAngle(get(LM.LEFT_HIP), get(LM.LEFT_KNEE), get(LM.LEFT_ANKLE));
        angles["kolano_prawe"] = calcAngle(get(LM.RIGHT_HIP), get(LM.RIGHT_KNEE), get(LM.RIGHT_ANKLE));
        angles["biodro_lewe"] = calcAngle(get(LM.LEFT_SHOULDER), get(LM.LEFT_HIP), get(LM.LEFT_KNEE));
        angles["biodro_prawe"] = calcAngle(get(LM.RIGHT_SHOULDER), get(LM.RIGHT_HIP), get(LM.RIGHT_KNEE));
        angles["kostka_lewa"] = calcAngle(get(LM.LEFT_KNEE), get(LM.LEFT_ANKLE), get(LM.LEFT_FOOT));
        angles["kostka_prawa"] = calcAngle(get(LM.RIGHT_KNEE), get(LM.RIGHT_ANKLE), get(LM.RIGHT_FOOT));
        break;
      case "pushup":
        angles["łokieć_lewy"] = calcAngle(get(LM.LEFT_SHOULDER), get(LM.LEFT_ELBOW), get(LM.LEFT_WRIST));
        angles["łokieć_prawy"] = calcAngle(get(LM.RIGHT_SHOULDER), get(LM.RIGHT_ELBOW), get(LM.RIGHT_WRIST));
        angles["biodro_lewe"] = calcAngle(get(LM.LEFT_SHOULDER), get(LM.LEFT_HIP), get(LM.LEFT_KNEE));
        angles["biodro_prawe"] = calcAngle(get(LM.RIGHT_SHOULDER), get(LM.RIGHT_HIP), get(LM.RIGHT_KNEE));
        break;
      case "lunge":
        angles["kolano_lewe"] = calcAngle(get(LM.LEFT_HIP), get(LM.LEFT_KNEE), get(LM.LEFT_ANKLE));
        angles["kolano_prawe"] = calcAngle(get(LM.RIGHT_HIP), get(LM.RIGHT_KNEE), get(LM.RIGHT_ANKLE));
        angles["biodro_lewe"] = calcAngle(get(LM.LEFT_SHOULDER), get(LM.LEFT_HIP), get(LM.LEFT_KNEE));
        angles["biodro_prawe"] = calcAngle(get(LM.RIGHT_SHOULDER), get(LM.RIGHT_HIP), get(LM.RIGHT_KNEE));
        break;
      case "plank":
        angles["biodro_lewe"] = calcAngle(get(LM.LEFT_SHOULDER), get(LM.LEFT_HIP), get(LM.LEFT_KNEE));
        angles["biodro_prawe"] = calcAngle(get(LM.RIGHT_SHOULDER), get(LM.RIGHT_HIP), get(LM.RIGHT_KNEE));
        angles["łokieć_lewy"] = calcAngle(get(LM.LEFT_SHOULDER), get(LM.LEFT_ELBOW), get(LM.LEFT_WRIST));
        angles["łokieć_prawy"] = calcAngle(get(LM.RIGHT_SHOULDER), get(LM.RIGHT_ELBOW), get(LM.RIGHT_WRIST));
        angles["kolano_lewe"] = calcAngle(get(LM.LEFT_HIP), get(LM.LEFT_KNEE), get(LM.LEFT_ANKLE));
        break;
      case "pullup":
        angles["łokieć_lewy"] = calcAngle(get(LM.LEFT_SHOULDER), get(LM.LEFT_ELBOW), get(LM.LEFT_WRIST));
        angles["łokieć_prawy"] = calcAngle(get(LM.RIGHT_SHOULDER), get(LM.RIGHT_ELBOW), get(LM.RIGHT_WRIST));
        angles["ramię_lewe"] = calcAngle(get(LM.LEFT_HIP), get(LM.LEFT_SHOULDER), get(LM.LEFT_ELBOW));
        angles["ramię_prawe"] = calcAngle(get(LM.RIGHT_HIP), get(LM.RIGHT_SHOULDER), get(LM.RIGHT_ELBOW));
        break;
    }
  } catch (_) {}
  return angles;
}

export function getAngleStatus(angleName, value, exercise) {
  const rules = {
    squat: { kolano_lewe: [70, 105], kolano_prawe: [70, 105], biodro_lewe: [65, 115], biodro_prawe: [65, 115], kostka_lewa: [65, 95], kostka_prawa: [65, 95] },
    pushup: { "łokieć_lewy": [80, 110], "łokieć_prawy": [80, 110], biodro_lewe: [165, 185], biodro_prawe: [165, 185] },
    lunge: { kolano_lewe: [80, 100], kolano_prawe: [80, 100], biodro_lewe: [80, 100], biodro_prawe: [80, 100] },
    plank: { biodro_lewe: [165, 185], biodro_prawe: [165, 185], "łokieć_lewy": [80, 100], "łokieć_prawy": [80, 100], kolano_lewe: [165, 185] },
    pullup: { "łokieć_lewy": [30, 60], "łokieć_prawy": [30, 60], "ramię_lewe": [30, 70], "ramię_prawe": [30, 70] },
  };
  const exerciseRules = rules[exercise];
  if (!exerciseRules || !exerciseRules[angleName]) return "neutral";
  const [min, max] = exerciseRules[angleName];
  return value >= min && value <= max ? "good" : "bad";
}

export const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 31], [28, 32],
];
