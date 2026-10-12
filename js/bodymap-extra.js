// Body-map overlays for muscles wger's map doesn't have (erector spinae, gluteus medius, the
// rotator cuff, forearm muscles ...). Drawn here, in the same 200 × 369 frame as wger's
// muscular_system_front/back.svg and in the same red as their overlays, so they light up with
// the muscle's effort like the others. Simple shapes (schematic), both sides. These shapes are the
// site's own drawing, not wger's (wger's files stay under CC-BY-SA in assets/wger/).

const RED = "fill:#fc0000;fill-opacity:1;opacity:0.52;stroke:none";
const pair = (shape) => [shape(1), shape(-1)]; // right side, then mirrored about x = 100
const mirrorX = (x, s) => (s > 0 ? x : 200 - x);
const ell = (cx, cy, rx, ry, rot = 0) => (s) => `<ellipse cx="${mirrorX(cx, s)}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot * s} ${mirrorX(cx, s)} ${cy})"/>`;
const poly = (pts) => (s) => `<polygon points="${pts.map(([x, y]) => `${mirrorX(x, s)},${y}`).join(" ")}"/>`;

/** key → { back: drawn on the back view, shapes: SVG elements in the 200 × 369 frame }. */
export const EXTRA = {
  // Back view
  "erector": { back: true, shapes: pair(poly([[96, 112], [99, 112], [99, 168], [95, 168], [92, 150], [93, 125]])) },
  "gluteus-medius": { back: true, shapes: pair(ell(76, 161, 10, 8, -20)) },
  "hip-rotators": { back: true, shapes: pair(ell(84, 186, 10, 4, 10)) },
  "adductor-magnus": { back: true, shapes: pair(ell(94, 218, 4, 16)) },
  "posterior-deltoid": { back: true, shapes: pair(ell(56, 81, 7, 11, -15)) },
  "infraspinatus": { back: true, shapes: pair(ell(79, 89, 10, 8, 10)) },
  "supraspinatus": { back: true, shapes: pair(ell(80, 70, 10, 3.5, -8)) },
  "teres-major": { back: true, shapes: pair(ell(70, 103, 7, 3.5, -30)) },
  "rhomboids": { back: true, shapes: pair(poly([[91, 70], [97, 70], [97, 102], [88, 96]])) },
  "lower-trapezius": { back: true, shapes: pair(poly([[88, 96], [96, 100], [100, 128], [99, 128], [92, 112]])) },
  "forearm-extensors": { back: true, shapes: pair(ell(40, 150, 5, 15, 12)) },
  "anconeus": { back: true, shapes: pair(ell(45, 133, 3, 4)) },
  // Front view
  "adductors": { back: false, shapes: pair(ell(94, 203, 5, 19, -6)) },
  "iliopsoas": { back: false, shapes: pair(ell(89, 182, 5, 8, 25)) },
  "tfl": { back: false, shapes: pair(ell(69, 176, 4, 9, -10)) },
  "sartorius": { back: false, shapes: pair(poly([[70, 180], [74, 179], [98, 247], [94, 249]])) },
  "lateral-deltoid": { back: false, shapes: pair(ell(52, 80, 5, 11, -12)) },
  "forearm-flexors": { back: false, shapes: pair(ell(42, 150, 5, 15, 12)) },
  "brachioradialis": { back: false, shapes: pair(ell(39, 138, 4, 10, 15)) },
  "hand": { back: false, shapes: pair(ell(24, 198, 6, 8, 25)) },
};

/** Muscle id → overlays: own keys (EXTRA) and wger ids (numbers) for muscles without a wgerId. */
export const MAP_BY_ID = {
  "erector-spinae": ["erector"],
  "gluteus-medius": ["gluteus-medius"], "gluteus-minimus": ["gluteus-medius"],
  "piriformis": ["hip-rotators"], "external-rotators": ["hip-rotators"],
  "adductor-magnus": ["adductor-magnus"], "adductors": ["adductors"], "pectineus": ["adductors"],
  "iliopsoas": ["iliopsoas"], "hip-flexors": ["iliopsoas"], "tfl": ["tfl"], "sartorius-rf": ["sartorius", 10],
  "posterior-deltoid": ["posterior-deltoid"], "lateral-deltoid": ["lateral-deltoid"],
  "supraspinatus": ["supraspinatus"], "rotator-cuff-ext": ["infraspinatus"], "teres-major": ["teres-major"],
  "mid-back": ["rhomboids"], "lower-traps": ["lower-trapezius", "rhomboids"], "lower-trapezius": ["lower-trapezius"],
  "serratus-anterior": [3], "scapular-rotators": [3, "lower-trapezius"],
  "brachioradialis": ["brachioradialis"], "anconeus": ["anconeus"],
  "fcu": ["forearm-flexors"], "fcr": ["forearm-flexors"], "palmaris-longus": ["forearm-flexors"], "fds": ["forearm-flexors"], "fdp": ["forearm-flexors"], "fpl": ["forearm-flexors"],
  "ecrb": ["forearm-extensors"], "ecrl": ["forearm-extensors"], "ecu": ["forearm-extensors"], "edc": ["forearm-extensors"], "extensors": ["forearm-extensors"],
  "thenar": ["hand"], "adductor": ["hand"], "interossei": ["hand"],
};

/** The overlay image for an own key, as an SVG data URL in wger's frame. */
export function extraOverlay(key) {
  const e = EXTRA[key];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="369.03" viewBox="0 0 200 369.03"><g style="${RED}">${e.shapes.join("")}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
