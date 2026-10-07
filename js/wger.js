// wger.de integration: exercise text/images (CC-BY-SA) and the muscle-map SVGs.
// Everything here is optional — the tool works offline without it.

const API = "https://wger.de/api/v2";
const STATIC = "https://wger.de/static/images/muscles";
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
