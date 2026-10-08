// wger.de integration: exercise text/images (CC-BY-SA, fetched live) and the muscle-map SVGs
// (copied into assets/wger, same licence, so the body map works offline).
// The API part is optional — the tool works offline without it.

const API = "https://wger.de/api/v2";
const STATIC = "assets/wger";
const ENGLISH = 2;

const cache = new Map();

export async function fetchExercise(id) {
  if (cache.has(id)) return cache.get(id);
  const res = await fetch(`${API}/exerciseinfo/${id}/`);
  if (!res.ok) throw new Error(`wger ${res.status}`);
  const data = await res.json();
  cache.set(id, data);
  return data;
}

/** Plain-text paragraphs from wger's HTML description (never inject their HTML). */
export function descriptionParagraphs(info) {
  const t = info.translations.find((x) => x.language === ENGLISH) ?? info.translations[0];
  const doc = new DOMParser().parseFromString(t?.description ?? "", "text/html");
  const paras = [...doc.querySelectorAll("p")].map((p) => p.textContent.trim()).filter(Boolean);
  return { name: t?.name ?? "", paragraphs: paras.length ? paras : [doc.body.textContent.trim()] };
}

export const bodyBackground = (front = true) => `${STATIC}/muscular_system_${front ? "front" : "back"}.svg`;
export const muscleOverlay = (wgerId) => `${STATIC}/main/muscle-${wgerId}.svg`;

// wger muscles drawn on the back view (is_front = false in /api/v2/muscle/):
// triceps, gastrocnemius, gluteus maximus, trapezius, biceps femoris, latissimus, soleus.
// Checked against the live API on 2026-10-08.
const BACK = new Set([5, 7, 8, 9, 11, 12, 15]);
export const isBackMuscle = (wgerId) => BACK.has(wgerId);
