// Inline SVG icons. icon("bolt") returns an <svg> that inherits the text color.
const NS = "http://www.w3.org/2000/svg";

// Stroke icons (24×24 grid).
const STROKE = {
  thief: ["M3 10.5C3 8.5 4.8 7 7 7h10c2.2 0 4 1.5 4 3.5 0 2.4-1.7 4-4 4-1.9 0-3.1-2.2-5-2.2S8.9 14.5 7 14.5c-2.3 0-4-1.6-4-4z", "M7.5 10.5h1.5M15 10.5h1.5"],
  wheel: ["M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4", "circle:12,12,9", "circle:12,12,2.2"],
  swords: ["M14.5 17.5 3 6V3h3l11.5 11.5", "M13 19l6-6M16 16l4 4M19 21l2-2", "M14.5 6.5 18 3h3v3l-3.5 3.5", "M5 14l4 4M7 17l-3 3M3 19l2 2"],
  transform: ["M7 4 3 8l4 4M3 8h14", "M17 20l4-4-4-4M21 16H7"],
  candy: ["M12 2.5l2.6 6.9 6.9 2.6-6.9 2.6L12 21.5l-2.6-6.9L2.5 12l6.9-2.6z"],
  payday: ["circle:12,12,9", "M12 6.5v11", "M15 9.2c-.5-1-1.6-1.6-3-1.6-1.8 0-3 .9-3 2.2 0 3.2 6 1.6 6 4.4 0 1.3-1.3 2.2-3 2.2-1.5 0-2.7-.7-3.1-1.8"],
  quake: ["M2 13h4l2.5-6 4 12 3-9 2 3h4.5"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  cross: ["M6.5 6.5l11 11M17.5 6.5l-11 11"],
  bolt: ["M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"],
  target: ["circle:12,12,9", "circle:12,12,5", "circle:12,12,1.2"],
  trophy: ["M8 21h8M12 16.5V21", "M7 3.5h10V9a5 5 0 0 1-10 0z", "M17 5h3v1.5A3.5 3.5 0 0 1 16.8 10M7 5H4v1.5A3.5 3.5 0 0 0 7.2 10"],
  clock: ["circle:12,12,9", "M12 7v5l3 2"],
  up: ["M6 15l6-6 6 6"],
  down: ["M6 9l6 6 6-6"],
  users: ["circle:9,8,3.5", "M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5", "M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .8 3.2 2.6 3.5 5.2"],
};

// Filled shapes for the four answers.
const FILLED = {
  shape0: "M12 3.5 21.5 20h-19z",                  // triangle
  shape1: "M12 2 22 12 12 22 2 12z",                // diamond
  shape2: "circle:12,12,9.5",                       // circle
  shape3: "M4 4h16v16H4z",                          // square
};

function draw(svg, d, filled) {
  if (d.startsWith("circle:")) {
    const [cx, cy, r] = d.slice(7).split(",");
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r);
    svg.append(c);
  } else {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  if (filled) svg.setAttribute("fill", "currentColor");
}

export function icon(name, cls = "") {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", `icon ${cls}`.trim());
  if (FILLED[name]) {
    draw(svg, FILLED[name], true);
  } else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    (STROKE[name] || []).forEach((d) => draw(svg, d, false));
  }
  return svg;
}

/** The emblem printed on the back of every board card. */
export function cardEmblem() {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "emblem");
  svg.innerHTML =
    '<circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".55"/>' +
    '<circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".35"/>' +
    '<path d="M24 9.5l3.6 10.9L38.5 24l-10.9 3.6L24 38.5l-3.6-10.9L9.5 24l10.9-3.6z" fill="currentColor"/>';
  return svg;
}
