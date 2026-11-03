// Get Sharp Academy brand kit (from "GetSharp_FINAL_INFO.pdf"): colours #87c0cd and #133756, Editorial Today Regular for
// headings and Antonio ExtraLight (+75 tracking) for the secondary type, plus the logo.
// Editorial Today is a commercial font whose file is not part of this project. Playfair Display (SIL OFL) stands in for it
// until the licensed file is added; a copy of Editorial Today installed on the viewer's computer is used first.
import logoFull from './logo-full.png?inline';
import logoMark from './logo-mark.png?inline';
import antonio200 from './fonts/antonio-latin-200-normal.woff2?inline';
import antonio200Ext from './fonts/antonio-latin-ext-200-normal.woff2?inline';
import antonio300 from './fonts/antonio-latin-300-normal.woff2?inline';
import playfair400 from './fonts/playfair-display-latin-400-normal.woff2?inline';
import playfair400Ext from './fonts/playfair-display-latin-ext-400-normal.woff2?inline';

export const BRAND = {
  name: 'Get Sharp Academy',
  tagline: 'Online | Anywhere | Anytime',
  teal: '#87c0cd',
  navy: '#133756',
  // darker teal used for text and buttons, because the brand teal is too light to carry white text (derived, not in the kit)
  tealDark: '#2C7388',
  logoFull,
  logoMark,
} as const;

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

const face = (family: string, weight: number, src: string, range: string) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${src}) format('woff2');unicode-range:${range}}`;

/** The brand fonts as @font-face rules with the font files inside, so a downloaded page needs no network. */
export function brandFontCss(): string {
  return [
    // an installed copy of the licensed heading font wins over the stand-in
    `@font-face{font-family:'Editorial Today';src:local('Editorial Today Regular'),local('Editorial Today'),local('EditorialToday-Regular')}`,
    face('Playfair Display', 400, playfair400, LATIN),
    face('Playfair Display', 400, playfair400Ext, LATIN_EXT),
    face('Antonio', 200, antonio200, LATIN),
    face('Antonio', 200, antonio200Ext, LATIN_EXT),
    face('Antonio', 300, antonio300, LATIN),
  ].join('\n');
}

export const DISPLAY_FONT = `'Editorial Today','Playfair Display',Georgia,serif`;
export const LABEL_FONT = `'Antonio',sans-serif`;

/** The player's colours and type in the brand. Appended after the player's own CSS so it wins. */
export function brandPlayerCss(): string {
  return `
:root{--ink:${BRAND.navy};--ink2:#4A6378;--accent:${BRAND.tealDark};--brand-teal:${BRAND.teal};--line:#C5D3DC;--line2:#E1EAEF;--paper:#FFFFFF;--hl:#E3F2F6}
body{background:#EAF2F5}
.head h1,.stage h2{font-family:${DISPLAY_FONT};font-weight:400;letter-spacing:0}
.head h1{font-size:1.7rem}
.pill.on{background:var(--ink);border-color:var(--ink)}
.pill.done{border-color:var(--brand-teal)}
.stage{border-top:4px solid var(--brand-teal)}
.cap{background:var(--ink);border-bottom:3px solid var(--brand-teal)}
.bar i{background:var(--brand-teal)}
.brandbar{max-width:1080px;margin:0 auto 10px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brandbar img{height:92px;width:auto;display:block}
.brandbar .tag,.brandfoot .tag{font-family:${LABEL_FONT};font-weight:200;letter-spacing:.075em;color:var(--ink);font-size:.95rem;white-space:nowrap}
.brandfoot{max-width:1080px;margin:16px auto 0;display:flex;align-items:center;justify-content:center;gap:12px;opacity:.9}
.brandfoot img{height:36px;width:auto}
.foot{display:none}
.grp{flex-basis:100%;text-align:center;font-family:${LABEL_FONT};font-weight:300;letter-spacing:.075em;font-size:.82rem;color:var(--accent);margin-top:6px}
@media(max-width:560px){.brandbar .tag{display:none}}
@media print{.brandbar,.brandfoot{display:flex}}
`;
}

export const brandBarHtml = () =>
  `<div class="brandbar"><img src="${BRAND.logoFull}" alt="${BRAND.name}"><span class="tag">${BRAND.tagline}</span></div>`;
export const brandFootHtml = () => `<div class="brandfoot"><img src="${BRAND.logoMark}" alt=""><span class="tag">${BRAND.name} &nbsp;|&nbsp; ${BRAND.tagline}</span></div>`;
