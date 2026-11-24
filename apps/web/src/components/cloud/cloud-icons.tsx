/*
 * Paths copied from components/ui/icons.tsx (@phosphor-icons/core 2.1.1).
 *
 * Icons: Phosphor Icons (https://phosphoricons.com). License notice, as shipped in @phosphor-icons/core:
 *
 * MIT License
 *
 * Copyright (c) 2023 Phosphor Icons
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */


// F23: icons only the cloud menus use, kept out of the shared icons module so tool pages and
// builds without cloud sources don't carry them.

/** Phosphor frame: 256 grid, currentColor, decorative (aria-hidden). */
const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

/** Phosphor arrow-left, bold (a submenu's "Back"). */
export const BackIcon = ({ size = 16 }: { size?: number }) =>
  svg(size, <path d="M228,128a12,12,0,0,1-12,12H69l51.52,51.51a12,12,0,0,1-17,17l-72-72a12,12,0,0,1,0-17l72-72a12,12,0,0,1,17,17L69,116H216A12,12,0,0,1,228,128Z" />);

/** Phosphor caret-right, bold (an item that opens a submenu). */
export const SubmenuIcon = ({ size = 14 }: { size?: number }) =>
  svg(size, <path d="M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z" />);

/** Phosphor desktop, duotone ("This device"). */
export const DeviceIcon = ({ size = 20 }: { size?: number }) =>
  svg(
    size,
    <>
      <path d="M224,56V96H32V56a8,8,0,0,1,8-8H216A8,8,0,0,1,224,56Z" opacity="0.2" />
      <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V88H40V56Zm0,144H40V104H216v96Z" />
    </>,
  );
