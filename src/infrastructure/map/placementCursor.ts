// The cursor shown while the map is armed to drop a marker. A plain crosshair says
// "precision" but not *what* is about to happen; this one carries the marker pin, so
// the armed state reads at the pointer rather than only in the panel.
//
// Drawn white on a dark outline so it stands out over any map, and small enough that
// the crosshair centre — the hotspot, where the marker actually lands — stays visible.
const CROSSHAIR_ARM = 9
const HOTSPOT = 12

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
<g fill="none" stroke="#0b0f16" stroke-width="4" stroke-linecap="round">
<line x1="${HOTSPOT - CROSSHAIR_ARM}" y1="${HOTSPOT}" x2="${HOTSPOT - 3}" y2="${HOTSPOT}"/>
<line x1="${HOTSPOT + 3}" y1="${HOTSPOT}" x2="${HOTSPOT + CROSSHAIR_ARM}" y2="${HOTSPOT}"/>
<line x1="${HOTSPOT}" y1="${HOTSPOT - CROSSHAIR_ARM}" x2="${HOTSPOT}" y2="${HOTSPOT - 3}"/>
<line x1="${HOTSPOT}" y1="${HOTSPOT + 3}" x2="${HOTSPOT}" y2="${HOTSPOT + CROSSHAIR_ARM}"/>
</g>
<g fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round">
<line x1="${HOTSPOT - CROSSHAIR_ARM}" y1="${HOTSPOT}" x2="${HOTSPOT - 3}" y2="${HOTSPOT}"/>
<line x1="${HOTSPOT + 3}" y1="${HOTSPOT}" x2="${HOTSPOT + CROSSHAIR_ARM}" y2="${HOTSPOT}"/>
<line x1="${HOTSPOT}" y1="${HOTSPOT - CROSSHAIR_ARM}" x2="${HOTSPOT}" y2="${HOTSPOT - 3}"/>
<line x1="${HOTSPOT}" y1="${HOTSPOT + 3}" x2="${HOTSPOT}" y2="${HOTSPOT + CROSSHAIR_ARM}"/>
</g>
<path d="M23 15a5 5 0 1 0-10 0c0 3.6 5 8 5 8s5-4.4 5-8z" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
<circle cx="18" cy="15" r="1.8" fill="#ffffff"/>
</svg>`

// `cursor` needs the fallback: a browser that rejects the image (or a size it won't
// take) would otherwise fall back to the default arrow and lose the crosshair too.
export const PLACEMENT_CURSOR =
  `url("data:image/svg+xml,${encodeURIComponent(SVG)}") ${HOTSPOT} ${HOTSPOT}, crosshair`
