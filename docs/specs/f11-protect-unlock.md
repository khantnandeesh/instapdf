# F11: Protect PDF, Unlock PDF

Routes: `/protect-pdf`, `/unlock-pdf`. Both run in the browser; neither the file nor a password is uploaded
or stored (rule 4). Reference pages: `docs/discovery/pages/{encrypt-pdf,unlock-pdf}.md`.

Built only from the shared components: `ToolFlow` (Protect is the first real tool on the F25 §4 settings
layout), `Switch` (new `spread` variant), `MoreOptions`, the existing password dialog, and a new shared
`PasswordInput` (the dialog and the owner-password prompt now use it too). The one-off guard's baseline did
not grow.

## 1. Where we beat the reference

| | Reference | BerryPDF |
|---|---|---|
| Privacy | The file and its password are uploaded | Done on the device; the CSP blocks uploads; the password is never stored |
| Encryption | AES-128 by default, AES-256 behind "More options" | Always AES-256 (PDF 2.0, revision 6) |
| Restrictions | A second step with many checkboxes | Three plain switches (print, copy, edit) beside the pages |
| Restrictions without an open password | Needs an owner password typed | Works on its own; a random owner password is set when the field is left empty |
| Several files | One at a time on the free tier | Any number, back as a ZIP |
| Limits | Daily task and size limits | None |
| Unlock: nothing to remove | Returns the same file | Says so instead of handing back an identical copy |

## 2. Protect (`/protect-pdf`)

Settings layout: pages on the left, side panel with step 1 "Password to open" and step 2 "People may"
(Print, Copy text and images, Edit, fill in and comment; all on by default). Switching one off shows
"Password for changes (optional)" in a slot that is always reserved, so nothing moves. Below 1024 px the
password sits in the bottom dock and the switches open under More options. The main button waits until
there is a password or at least one restriction, and says why ("Enter a password"). Engine
`lib/pdf/protect.ts` (@cantoo/pdf-lib, MIT): AES-256; screen-reader access always stays allowed; a
password over 127 bytes is refused, not cut; the owner password must differ from the open one. A file that
already has a password asks for it first (the shared dialog) and is then re-encrypted with the new one.

## 3. Unlock (`/unlock-pdf`)

Bare flow, no options. A file with an open password asks for it in the shared dialog; a file with only
restrictions opens directly. The copy is saved with no password and no restrictions. The page says this is
for files you own or may change.

## 4. Acceptance criteria

- AC-800 The Protect button is disabled with "Enter a password" until a password or a restriction is set.
- AC-801 Output is AES-256 encrypted and opens only with the password (checked with pdf.js as a second reader).
- AC-802 Restrictions alone protect a file that opens freely; the stored rights match the switches.
- AC-803 A blank owner password with restrictions sets a random one; the open password never lifts them.
- AC-804 Passwords over 127 bytes and an owner password equal to the open one are refused with a message.
- AC-805 The protected download keeps the file name; its text is not readable in the bytes.
- AC-806 Showing the owner field moves no other control (reserved slot).
- AC-807 Several files return as a ZIP, each protected.
- AC-808 No password reaches localStorage or sessionStorage, and none survives a reload.
- AC-810 Unlock removes an open password after the dialog (wrong password shows the error, right one continues).
- AC-811 Unlock removes owner restrictions with no prompt; text and page count are unchanged.
- AC-812 A PDF with nothing to remove gets "This PDF has no password or restrictions, so there is nothing to remove."
- AC-813 Both pages pass the every-tool guards: first-screen fit at every size, one scroller, focus rings, first-load budget.

Tests: `src/lib/pdf/protect.test.ts`, `e2e/f11/security.spec.ts`. Screenshots: `designs/f11/`.
