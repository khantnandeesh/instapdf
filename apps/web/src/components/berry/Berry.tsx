/**
 * BerryPDF motifs (docs/design/berrypdf.md, "Berry motifs"): the berry sprite, the berry mark,
 * the berry loader, floating berries and blossoms, stickers and the vine divider.
 *
 * All markup is the design system's own SVG, converted to JSX with classes only (no style
 * attributes: the strict CSP allows none in server HTML). Motion lives in globals.css; under
 * reduced motion everything stands still. Everything here is decorative and aria-hidden unless
 * a label is passed, and nothing takes focus.
 *
 * Server-safe: no hooks, no "use client".
 */
import { cx } from "../ui/cx";

/**
 * The shared SVG definitions (gradients, clip paths, the berry skin and cut face, the star,
 * the blossom and the leaf). Rendered once per page, in the root layout; every berry, loader,
 * sticker and floaty refers to it with <use href="#mp-...">.
 */
export function BerrySprite() {
  return (
    <svg width="0" height="0" className="mp-sprite" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mp-skin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5a4e" />
          <stop offset=".55" stopColor="#ee2238" />
          <stop offset="1" stopColor="#d4142f" />
        </linearGradient>
        <radialGradient id="mp-flesh" cx="50%" cy="52%" r="60%">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".4" stopColor="#ffd5db" />
          <stop offset=".8" stopColor="#ff8798" />
          <stop offset="1" stopColor="#f2405a" />
        </radialGradient>
        <clipPath id="mp-sil">
          <path d="M48 95C35 90 14 69 12 46c-1-15 9-26 22-26 5 0 10 1.5 14 3 4-1.5 9-3 14-3 13 0 23 11 22 26-2 23-23 44-36 49z" />
        </clipPath>
        <clipPath id="mp-clip-l">
          <rect x="-200" y="-200" width="300.5" height="600" />
        </clipPath>
        <clipPath id="mp-clip-r">
          <rect x="99.5" y="-200" width="300" height="600" />
        </clipPath>
        <symbol id="mp-berry-skin" viewBox="0 0 96 96" overflow="visible">
          <path fill="url(#mp-skin)" d="M48 95C35 90 14 69 12 46c-1-15 9-26 22-26 5 0 10 1.5 14 3 4-1.5 9-3 14-3 13 0 23 11 22 26-2 23-23 44-36 49z" />
          <g clipPath="url(#mp-sil)">
            <path fill="#ff7a68" d="M16 44c0-12 8-20 18-20 8 0 10 8 6 16-4 9-12 18-18 18-4 0-6-6-6-14z" />
            <path fill="#b80d2c" d="M63 16C82 40 71 74 44 97H100V10z" />
            <path fill="#8f0926" d="M78 30C88 52 77 80 53 97H100V20z" />
            <path fill="none" stroke="#ff8fa0" strokeWidth="2" strokeLinecap="round" d="M80 52c-4 16-17 31-28 38" />
            <g transform="translate(44.2 34) rotate(-3) scale(0.96 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(57.5 34) rotate(7) scale(0.89 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(69.6 34) rotate(15) scale(0.76 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(37.9 43) rotate(-7) scale(0.89 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(50.5 43) rotate(2) scale(0.97 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(63.8 43) rotate(11) scale(0.82 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(74.1 43) rotate(18) scale(0.71 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(21.9 52) rotate(-18) scale(0.71 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(33.9 52) rotate(-10) scale(0.84 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(45.3 52) rotate(-2) scale(0.97 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(58.8 52) rotate(8) scale(0.88 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(69.2 52) rotate(15) scale(0.76 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(26.9 61) rotate(-15) scale(0.77 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(38.5 61) rotate(-7) scale(0.89 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(52.1 61) rotate(3) scale(0.95 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(64.1 61) rotate(11) scale(0.82 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(32.0 70) rotate(-11) scale(0.82 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(44.4 70) rotate(-2) scale(0.96 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(56.6 70) rotate(6) scale(0.90 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(40.8 79) rotate(-5) scale(0.92 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(51.5 79) rotate(2) scale(0.96 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <g transform="translate(46.3 87) rotate(-1) scale(0.98 1)">
              <path fill="#7d0820" opacity=".75" d="M-2.6-.4a2.6 3 0 0 1 5.2 0c0 .6-.4 0-2.6 0s-2.6.6-2.6 0z" />
              <ellipse fill="#ffe9a6" rx="1.5" ry="2.2" cy=".6" />
              <circle fill="#fff" cx="-.4" cy="-.1" r=".55" />
            </g>
            <path fill="#fff" d="M20 48c-1-11 5-19 13-21 3-.7 4 3 1.2 4.4-5 2.4-7.6 8-7.6 15 0 4-6 4.4-6.6 1.600z" />
            <ellipse fill="#fff" cx="23.5" cy="58" rx="2.2" ry="2.8" />
            <path fill="#fff" transform="translate(38 30) scale(.75)" d="M0-7C.9-2 2-.9 7 0 2 .9 .9 2 0 7-.9 2-2 .9-7 0-2-.9-.9-2 0-7z" />
          </g>
          <path
            fill="none"
            stroke="#6d0a1c"
            strokeWidth="1.8"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            d="M48 95C35 90 14 69 12 46c-1-15 9-26 22-26 5 0 10 1.5 14 3 4-1.5 9-3 14-3 13 0 23 11 22 26-2 23-23 44-36 49z"
          />
          <g transform="translate(48 25) rotate(-80)">
            <path fill="#1f8a45" d="M-5.5 3C-10.0 -11.5 -8.0 -26.4 -3.0 -33.0C2.0 -24.8 10.0 -9.9 5.5 3z" />
            <path fill="#136332" d="M0 3C-0.9 -13.2 -2.4 -26.4 -3.0 -33.0C2.0 -24.8 10.0 -9.9 5.5 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.0 -7.3C-6.2 -14.8 -4.8 -23.1 -2.4 -29.0" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C-0.9 -13.2 -2.1 -23.1 -2.7 -29.7" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.5 3C-10.0 -11.5 -8.0 -26.4 -3.0 -33.0C2.0 -24.8 10.0 -9.9 5.5 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(82)">
            <path fill="#1f8a45" d="M-5.5 3C-10.0 -11.2 -2.0 -25.6 3.0 -32.0C8.0 -24.0 10.0 -9.6 5.5 3z" />
            <path fill="#136332" d="M0 3C0.9 -12.8 2.4 -25.6 3.0 -32.0C8.0 -24.0 10.0 -9.6 5.5 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.0 -7.0C-6.2 -14.4 -1.2 -22.4 2.4 -28.2" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C0.9 -12.8 2.1 -22.4 2.7 -28.8" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.5 3C-10.0 -11.2 -2.0 -25.6 3.0 -32.0C8.0 -24.0 10.0 -9.6 5.5 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(-40)">
            <path fill="#1f8a45" d="M-5.5 3C-10.0 -14.0 -8.0 -32.0 -3.0 -40.0C2.0 -30.0 10.0 -12.0 5.5 3z" />
            <path fill="#136332" d="M0 3C-0.9 -16.0 -2.4 -32.0 -3.0 -40.0C2.0 -30.0 10.0 -12.0 5.5 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.0 -8.8C-6.2 -18.0 -4.8 -28.0 -2.4 -35.2" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C-0.9 -16.0 -2.1 -28.0 -2.7 -36.0" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.5 3C-10.0 -14.0 -8.0 -32.0 -3.0 -40.0C2.0 -30.0 10.0 -12.0 5.5 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(43)">
            <path fill="#1f8a45" d="M-5.5 3C-10.0 -13.6 -2.0 -31.2 3.0 -39.0C8.0 -29.2 10.0 -11.7 5.5 3z" />
            <path fill="#136332" d="M0 3C0.9 -15.6 2.4 -31.2 3.0 -39.0C8.0 -29.2 10.0 -11.7 5.5 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.0 -8.6C-6.2 -17.6 -1.2 -27.3 2.4 -34.3" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C0.9 -15.6 2.1 -27.3 2.7 -35.1" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.5 3C-10.0 -13.6 -2.0 -31.2 3.0 -39.0C8.0 -29.2 10.0 -11.7 5.5 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(2)">
            <path fill="#1f8a45" d="M-5.5 3C-10.0 -15.0 -4.0 -34.4 1.0 -43.0C6.0 -32.2 10.0 -12.9 5.5 3z" />
            <path fill="#136332" d="M0 3C0.3 -17.2 0.8 -34.4 1.0 -43.0C6.0 -32.2 10.0 -12.9 5.5 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.0 -9.5C-6.2 -19.4 -2.4 -30.1 0.8 -37.8" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C0.3 -17.2 0.7 -30.1 0.9 -38.7" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.5 3C-10.0 -15.0 -4.0 -34.4 1.0 -43.0C6.0 -32.2 10.0 -12.9 5.5 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(-98)">
            <path fill="#3fc25a" d="M-5.8 3C-10.5 -9.4 -10.2 -21.6 -5.0 -27.0C0.2 -20.2 10.5 -8.1 5.8 3z" />
            <path fill="#229149" d="M0 3C-1.5 -10.8 -4.0 -21.6 -5.0 -27.0C0.2 -20.2 10.5 -8.1 5.8 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.2 -5.9C-6.5 -12.2 -6.2 -18.9 -4.0 -23.8" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C-1.5 -10.8 -3.5 -18.9 -4.5 -24.3" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.8 3C-10.5 -9.4 -10.2 -21.6 -5.0 -27.0C0.2 -20.2 10.5 -8.1 5.8 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(98)">
            <path fill="#3fc25a" d="M-5.8 3C-10.5 -9.1 -0.2 -20.8 5.0 -26.0C10.2 -19.5 10.5 -7.8 5.8 3z" />
            <path fill="#229149" d="M0 3C1.5 -10.4 4.0 -20.8 5.0 -26.0C10.2 -19.5 10.5 -7.8 5.8 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.2 -5.7C-6.5 -11.7 -0.1 -18.2 4.0 -22.9" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C1.5 -10.4 3.5 -18.2 4.5 -23.4" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.8 3C-10.5 -9.1 -0.2 -20.8 5.0 -26.0C10.2 -19.5 10.5 -7.8 5.8 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(-58)">
            <path fill="#3fc25a" d="M-5.8 3C-10.5 -11.5 -9.2 -26.4 -4.0 -33.0C1.2 -24.8 10.5 -9.9 5.8 3z" />
            <path fill="#229149" d="M0 3C-1.2 -13.2 -3.2 -26.4 -4.0 -33.0C1.2 -24.8 10.5 -9.9 5.8 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.2 -7.3C-6.5 -14.8 -5.5 -23.1 -3.2 -29.0" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C-1.2 -13.2 -2.8 -23.1 -3.6 -29.7" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.8 3C-10.5 -11.5 -9.2 -26.4 -4.0 -33.0C1.2 -24.8 10.5 -9.9 5.8 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(60)">
            <path fill="#3fc25a" d="M-5.8 3C-10.5 -11.2 -1.2 -25.6 4.0 -32.0C9.2 -24.0 10.5 -9.6 5.8 3z" />
            <path fill="#229149" d="M0 3C1.2 -12.8 3.2 -25.6 4.0 -32.0C9.2 -24.0 10.5 -9.6 5.8 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.2 -7.0C-6.5 -14.4 -0.8 -22.4 3.2 -28.2" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C1.2 -12.8 2.8 -22.4 3.6 -28.8" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.8 3C-10.5 -11.2 -1.2 -25.6 4.0 -32.0C9.2 -24.0 10.5 -9.6 5.8 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(-20)">
            <path fill="#3fc25a" d="M-5.8 3C-10.5 -12.2 -7.2 -28.0 -2.0 -35.0C3.2 -26.2 10.5 -10.5 5.8 3z" />
            <path fill="#229149" d="M0 3C-0.6 -14.0 -1.6 -28.0 -2.0 -35.0C3.2 -26.2 10.5 -10.5 5.8 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.2 -7.7C-6.5 -15.8 -4.3 -24.5 -1.6 -30.8" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C-0.6 -14.0 -1.4 -24.5 -1.8 -31.5" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.8 3C-10.5 -12.2 -7.2 -28.0 -2.0 -35.0C3.2 -26.2 10.5 -10.5 5.8 3z"
            />
          </g>
          <g transform="translate(48 25) rotate(23)">
            <path fill="#3fc25a" d="M-5.8 3C-10.5 -11.9 -3.2 -27.2 2.0 -34.0C7.2 -25.5 10.5 -10.2 5.8 3z" />
            <path fill="#229149" d="M0 3C0.6 -13.6 1.6 -27.2 2.0 -34.0C7.2 -25.5 10.5 -10.2 5.8 3z" />
            <path fill="none" stroke="#c4f7a8" strokeWidth="1.2" strokeLinecap="round" d="M-5.2 -7.5C-6.5 -15.3 -1.9 -23.8 1.6 -29.9" />
            <path fill="none" stroke="#0f4f25" strokeWidth=".9" opacity=".55" strokeLinecap="round" d="M0 1C0.6 -13.6 1.4 -23.8 1.8 -30.6" />
            <path
              fill="none"
              stroke="#0f4f25"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              d="M-5.8 3C-10.5 -11.9 -3.2 -27.2 2.0 -34.0C7.2 -25.5 10.5 -10.2 5.8 3z"
            />
          </g>
          <path stroke="#0f4f25" strokeWidth="7" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" d="M48 24c-1.5-7 1-13 7-17" />
          <path stroke="#3fc25a" strokeWidth="4.2" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" d="M48 24c-1.5-7 1-13 7-17" />
          <path stroke="#c4f7a8" strokeWidth="1.2" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" d="M47 22c-1-5 .5-9.5 4.5-13" />
        </symbol>
        <symbol id="mp-berry-face" viewBox="0 0 96 96" overflow="visible">
          <path fill="#e01f3a" d="M48 95C35 90 14 69 12 46c-1-15 9-26 22-26 5 0 10 1.5 14 3 4-1.5 9-3 14-3 13 0 23 11 22 26-2 23-23 44-36 49z" />
          <path
            fill="url(#mp-flesh)"
            transform="translate(48 58) scale(.92) translate(-48 -58)"
            d="M48 95C35 90 14 69 12 46c-1-15 9-26 22-26 5 0 10 1.5 14 3 4-1.5 9-3 14-3 13 0 23 11 22 26-2 23-23 44-36 49z"
          />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M44.0 69.3L38.0 81.4" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M41.1 64.5L30.7 71.5" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M40.0 58.0L28.0 58.0" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M41.1 51.5L30.7 44.5" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M44.0 46.7L38.0 34.6" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M48.0 45.0L48.0 31.0" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M52.0 46.7L58.0 34.6" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M54.9 51.5L65.3 44.5" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M56.0 58.0L68.0 58.0" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M54.9 64.5L65.3 71.5" />
          <path stroke="#fff" strokeWidth="1.4" opacity=".75" strokeLinecap="round" d="M52.0 69.3L58.0 81.4" />
          <path fill="#fff" d="M48 36c8 6 10 17 7 28-2 7-4 11-7 14-3-3-5-7-7-14-3-11-1-22 7-28z" />
          <path fill="#ffc2cc" d="M48 47c3 3 4 9 3 15-.7 3-1.7 5-3 7-1.3-2-2.3-4-3-7-1-6 0-12 3-15z" />
          <path fill="#fff" opacity=".9" d="M22 44c1-8 5-13 10-15-4 6-5 14-4 24z" />
          <path
            fill="none"
            stroke="#6d0a1c"
            strokeWidth="1.8"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            d="M48 95C35 90 14 69 12 46c-1-15 9-26 22-26 5 0 10 1.5 14 3 4-1.5 9-3 14-3 13 0 23 11 22 26-2 23-23 44-36 49z"
          />
          <path fill="#3fc25a" stroke="#0f4f25" strokeWidth="1.5" vectorEffect="non-scaling-stroke" d="M36 23c7-6 17-6 24 0-6 5-18 5-24 0z" />
        </symbol>
        <symbol id="mp-star" viewBox="-8 -8 16 16" overflow="visible">
          <path d="M0-7C.9-2 2-.9 7 0 2 .9 .9 2 0 7-.9 2-2 .9-7 0-2-.9-.9-2 0-7z" />
        </symbol>
        <symbol id="mp-blossom" viewBox="-10 -10 20 20" overflow="visible">
          <g transform="translate(0 0) scale(1)">
            <g fill="#fff" stroke="#f7b9c4" strokeWidth=".8">
              <ellipse rx="3.4" ry="4.4" cy="-4.6" transform="rotate(0)" />
              <ellipse rx="3.4" ry="4.4" cy="-4.6" transform="rotate(72)" />
              <ellipse rx="3.4" ry="4.4" cy="-4.6" transform="rotate(144)" />
              <ellipse rx="3.4" ry="4.4" cy="-4.6" transform="rotate(216)" />
              <ellipse rx="3.4" ry="4.4" cy="-4.6" transform="rotate(288)" />
            </g>
            <circle r="2.6" fill="#ffd84d" />
          </g>
        </symbol>
        <symbol id="mp-leaf" viewBox="-6 -10 12 17" overflow="visible">
          <path fill="#3fc25a" stroke="#0f4f25" strokeWidth="1" d="M0 6C-5 2-5-5 0-9 5-5 5 2 0 6z" />
          <path stroke="#0f4f25" strokeWidth=".7" opacity=".6" d="M0 5V-6" />
        </symbol>
      </defs>
    </svg>
  );
}

/** The berry mark (the logo). Inside a `.mp-brand` link it tips 14 degrees and grows to 1.1 on hover. */
export function BerryMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="-12 -28 120 126" className={cx("mp-mark", className)} aria-hidden="true" focusable="false">
      <use href="#mp-berry-skin" width="96" height="96" />
    </svg>
  );
}

/**
 * The berry loader: tossed, sliced, the halves fall away while juice splatters (2.6s loop).
 * Sizes: "sm" 40px (rows, buttons), "md" 96px (panels), "lg" 180px (full waits), or a pixel size
 * for inline spinners. With `label` it is an image named by the label; otherwise decorative.
 * Under reduced motion it is a still, whole berry.
 */
export function BerryLoader({ size = "md", label, className }: { size?: "sm" | "md" | "lg" | 16 | 20 | 24 | 28; label?: string; className?: string }) {
  const px = typeof size === "number" ? size : undefined;
  return (
    <svg
      viewBox="0 0 200 200"
      className={cx("mp-berry", size === "sm" && "mp-berry--sm", size === "lg" && "mp-berry--lg", px !== undefined && `mp-berry--${px}`, className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      focusable="false"
    >
      <g className="whole">
        <g className="wx">
          <g className="wy">
            <g className="wr">
              <use href="#mp-berry-skin" x="52" y="40" width="96" height="96" />
            </g>
          </g>
        </g>
      </g>
      <g className="halves">
        <g className="hx hx-l">
          <g className="hy hy-l">
            <g className="hr hr-l">
              <g className="skin" clipPath="url(#mp-clip-l)">
                <use href="#mp-berry-skin" x="52" y="40" width="96" height="96" />
              </g>
              <g className="face">
                <use href="#mp-berry-face" x="87" y="40" width="96" height="96" />
              </g>
            </g>
          </g>
        </g>
        <g className="hx hx-r">
          <g className="hy hy-r">
            <g className="hr hr-r">
              <g className="skin" clipPath="url(#mp-clip-r)">
                <use href="#mp-berry-skin" x="52" y="40" width="96" height="96" />
              </g>
              <g className="face">
                <use href="#mp-berry-face" x="17" y="40" width="96" height="96" />
              </g>
            </g>
          </g>
        </g>
      </g>
      <g className="juice">
        <g className="tilt" transform="rotate(-22 100 94)">
          <g className="splash">
            <ellipse fill="#ee2238" opacity=".9" cx="100" cy="94" rx="16" ry="4" transform="rotate(0 100 94) translate(16 0)" />
            <ellipse fill="#ee2238" opacity=".9" cx="100" cy="94" rx="18" ry="4.5" transform="rotate(180 100 94) translate(17 0)" />
            <ellipse fill="#ee2238" opacity=".9" cx="100" cy="94" rx="10" ry="3" transform="rotate(25 100 94) translate(20 0)" />
            <ellipse fill="#ee2238" opacity=".9" cx="100" cy="94" rx="11" ry="3" transform="rotate(-155 100 94) translate(21 0)" />
            <ellipse fill="#ee2238" opacity=".9" cx="100" cy="94" rx="9" ry="2.5" transform="rotate(-28 100 94) translate(18 0)" />
            <ellipse fill="#ee2238" opacity=".9" cx="100" cy="94" rx="8" ry="2.5" transform="rotate(160 100 94) translate(20 0)" />
          </g>
        </g>
        <g className="dx dx0">
          <g className="dy dy0">
            <ellipse fill="#ee2238" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="2.2" ry="2.5" />
            <ellipse fill="#fff" opacity=".6" cx="99.4" cy="93.1" rx="0.5" ry="0.6" />
          </g>
        </g>
        <g className="dx dx1">
          <g className="dy dy1">
            <ellipse fill="#ee2238" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="4.6" ry="5.2" />
            <ellipse fill="#fff" opacity=".6" cx="98.6" cy="92.2" rx="1.1" ry="1.4" />
          </g>
        </g>
        <g className="dx dx2">
          <g className="dy dy2">
            <ellipse fill="#d4142f" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="4.3" ry="4.9" />
            <ellipse fill="#fff" opacity=".6" cx="98.7" cy="92.3" rx="1.1" ry="1.3" />
          </g>
        </g>
        <g className="dx dx3">
          <g className="dy dy3">
            <ellipse fill="#ff5a4e" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="2.4" ry="2.7" />
            <ellipse fill="#fff" opacity=".6" cx="99.3" cy="93.1" rx="0.6" ry="0.7" />
          </g>
        </g>
        <g className="dx dx4">
          <g className="dy dy4">
            <ellipse fill="#ff5a4e" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="4.4" ry="5.1" />
            <ellipse fill="#fff" opacity=".6" cx="98.7" cy="92.2" rx="1.1" ry="1.3" />
          </g>
        </g>
        <g className="dx dx5">
          <g className="dy dy5">
            <ellipse fill="#d4142f" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="3.4" ry="4.0" />
            <ellipse fill="#fff" opacity=".6" cx="99.0" cy="92.6" rx="0.9" ry="1.0" />
          </g>
        </g>
        <g className="dx dx6">
          <g className="dy dy6">
            <ellipse fill="#d4142f" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="2.7" ry="3.1" />
            <ellipse fill="#fff" opacity=".6" cx="99.2" cy="92.9" rx="0.7" ry="0.8" />
          </g>
        </g>
        <g className="dx dx7">
          <g className="dy dy7">
            <ellipse fill="#ff5a4e" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="2.3" ry="2.6" />
            <ellipse fill="#fff" opacity=".6" cx="99.3" cy="93.1" rx="0.6" ry="0.7" />
          </g>
        </g>
        <g className="dx dx8">
          <g className="dy dy8">
            <ellipse fill="#d4142f" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="2.9" ry="3.4" />
            <ellipse fill="#fff" opacity=".6" cx="99.1" cy="92.8" rx="0.7" ry="0.9" />
          </g>
        </g>
        <g className="dx dx9">
          <g className="dy dy9">
            <ellipse fill="#ee2238" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="1.8" ry="2.1" />
            <ellipse fill="#fff" opacity=".6" cx="99.5" cy="93.3" rx="0.5" ry="0.5" />
          </g>
        </g>
        <g className="dx dx10">
          <g className="dy dy10">
            <ellipse fill="#ee2238" stroke="#6d0a1c" strokeWidth=".9" cx="100" cy="94" rx="2.1" ry="2.5" />
            <ellipse fill="#fff" opacity=".6" cx="99.4" cy="93.1" rx="0.5" ry="0.6" />
          </g>
        </g>
      </g>
      <g className="tilt" transform="rotate(-22 100 94)">
        <g className="slash">
          <path fill="#69d2ff" opacity=".7" d="M100-40l9 134-9 150-9-150z" />
          <path fill="#fff" stroke="#bfeaff" strokeWidth="1" d="M100-40l3.600 134-3.600 150-3.600-150z" />
        </g>
      </g>
      <g className="lines">
        <path stroke="#ff8aa0" strokeWidth="1" strokeLinecap="round" d="M182 100L240 104" />
        <path stroke="#ff8aa0" strokeWidth="1" strokeLinecap="round" d="M168 110L236 127" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M168 134L221 165" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M159 146L206 186" />
        <path stroke="#ff8aa0" strokeWidth="1" strokeLinecap="round" d="M137 166L164 219" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M128 172L147 226" />
        <path stroke="#ff8aa0" strokeWidth="2.5" strokeLinecap="round" d="M105 163L110 234" />
        <path stroke="#ff8aa0" strokeWidth="1" strokeLinecap="round" d="M77 173L61 229" />
        <path stroke="#ff8aa0" strokeWidth="2.5" strokeLinecap="round" d="M61 166L33 217" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M51 142L0 192" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M44 129L-19 168" />
        <path stroke="#ff8aa0" strokeWidth="2.5" strokeLinecap="round" d="M38 115L-32 140" />
        <path stroke="#ff8aa0" strokeWidth="2.5" strokeLinecap="round" d="M16 91L-40 89" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M38 81L-37 66" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M39 52L-15 14" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M52 47L-1 -3" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M61 24L32 -28" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M81 25L63 -41" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M94 12L89 -46" />
        <path stroke="#ff8aa0" strokeWidth="1" strokeLinecap="round" d="M113 22L125 -44" />
        <path stroke="#ff8aa0" strokeWidth="1" strokeLinecap="round" d="M136 40L177 -23" />
        <path stroke="#ff8aa0" strokeWidth="1.5" strokeLinecap="round" d="M161 38L203 -1" />
        <path stroke="#ff8aa0" strokeWidth="2.5" strokeLinecap="round" d="M170 56L223 27" />
        <path stroke="#ff8aa0" strokeWidth="1" strokeLinecap="round" d="M168 71L232 49" />
      </g>
      <g className="flash">
        <use href="#mp-star" x="60" y="54" width="80" height="80" fill="#fff" stroke="#ffe27a" strokeWidth="1.5" />
      </g>
      <g className="tw tw1">
        <use href="#mp-star" x="150" y="40" width="18" height="18" fill="#ffd84d" />
      </g>
      <g className="tw tw2">
        <use href="#mp-star" x="34" y="58" width="12" height="12" fill="#ff9db0" />
      </g>
      <g className="tw tw3">
        <use href="#mp-star" x="158" y="120" width="10" height="10" fill="#ffd84d" />
      </g>
    </svg>
  );
}

type Depth = "far" | "mid" | "back";
type Kind = "b" | "f";
const SETS: Record<"hero" | "empty", [Depth, Kind][]> = {
  hero: [
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["mid", "f"],
    ["mid", "f"],
    ["back", "b"],
    ["back", "b"],
    ["back", "b"],
    ["back", "b"],
    ["back", "f"],
    ["back", "f"],
  ],
  empty: [
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["far", "b"],
    ["mid", "f"],
    ["mid", "f"],
    ["far", "f"],
    ["back", "b"],
    ["back", "b"],
    ["back", "b"],
    ["back", "b"],
    ["back", "f"],
    ["back", "f"],
    ["back", "f"],
  ],
};

/**
 * Small, pale berries and blossoms floating behind a hero or an empty state (the levitation
 * effect). Positions, sizes, tilts and timings are per item in globals.css (.mp-floaties--hero,
 * .mp-floaties--empty), so nothing moves in step. Behind the text layer; ignores the pointer.
 */
export function Floaties({ set, className }: { set: "hero" | "empty"; className?: string }) {
  return (
    <div className={cx("mp-floaties", `mp-floaties--${set}`, className)} aria-hidden="true">
      {SETS[set].map(([depth, kind], i) => (
        <span key={i} className={`mp-floaty mp-floaty--${depth}`}>
          {kind === "b" ? (
            <svg viewBox="-12 -30 120 128" focusable="false">
              <use href="#mp-berry-skin" width="96" height="96" />
            </svg>
          ) : (
            <svg viewBox="-10 -10 20 20" focusable="false">
              <use href="#mp-blossom" x="-10" y="-10" width="20" height="20" />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}

/** A die-cut sticker (berry, blossom or leaf) with a white edge. Decorative; at most three per screen. */
export function Sticker({ kind, size, className }: { kind: "berry" | "blossom" | "leaf"; size: number; className?: string }) {
  return (
    <span className={cx("mp-sticker", className)} aria-hidden="true">
      {kind === "berry" ? (
        <svg width={size} height={size} viewBox="-12 -28 120 126" focusable="false" className="overflow-visible">
          <use href="#mp-berry-skin" width="96" height="96" />
        </svg>
      ) : kind === "blossom" ? (
        <svg width={size} height={size} viewBox="-10 -10 20 20" focusable="false" className="overflow-visible">
          <use href="#mp-blossom" x="-10" y="-10" width="20" height="20" />
        </svg>
      ) : (
        <svg width={Math.round((size * 12) / 17)} height={size} viewBox="-6 -10 12 17" focusable="false" className="overflow-visible">
          <use href="#mp-leaf" x="-6" y="-10" width="12" height="17" />
        </svg>
      )}
    </span>
  );
}

/** The strawberry-vine divider: a section break (still). Moving, the same vine is the loading strip. */
export function VineDivider({ className }: { className?: string }) {
  return <div className={cx("mp-vine", className)} aria-hidden="true" />;
}
