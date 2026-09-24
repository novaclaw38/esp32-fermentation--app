---
target: signin page
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/fermentation-/dashboard/src/pages/Login.tsx"
target_fingerprint: "sha256:f2d5b934992677e1ebc70a4947a18f2ae6f9c9f7861fb863623e11f61faa786f"
target_path: /home/user/fermentation-/dashboard/src/pages/Login.tsx
timestamp: 2026-09-23T15-18-23Z
slug: dashboard-src-pages-login-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Sign-in page critique (dashboard/src/pages/Login.tsx, plus ResetPassword.tsx and InstrumentMark.tsx)

### Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Busy labels and inline messages work. The card jumps when a message appears, and focus drops to `<body>` after "Forgot password?". |
| 2 | Match between system and real world | 2 | Raw Supabase strings ("Invalid login credentials"). Nothing mentions devices or claim codes. |
| 3 | User control and freedom | 2 | After signup the page flips to a sign-in form the user can't use yet. The expired-reset link leads back to sign-in mode, not forgot mode. |
| 4 | Consistency and standards | 3 | Tokens are consistent. Exceptions: the cold gray placeholder, the native validation bubble, and sentence-case field labels. |
| 5 | Error prevention | 2 | No show-password toggle. The 6-character minimum is enforced on *sign-in*, where it only blocks. |
| 6 | Recognition rather than recall | 3 | The password rule lives only in the placeholder and disappears once typing starts. |
| 7 | Flexibility and efficiency | 2 | Tab order is Email → Forgot → Password. The password field has no programmatic label. |
| 8 | Aesthetic and minimalist design | 3 | Clean, restrained and on-palette. It is also anonymous, and on desktop the form is a small island. |
| 9 | Error recovery | 2 | A failed sign-in is a dead end. The short-password error is the browser's white bubble. |
| 10 | Help and documentation | 1 | No "where's my claim code?", no support route, no hint of what happens after signup. |
| **Total** | | **23/40** | **Acceptable** |

### Design specificity verdict
- **Design review:** the page is on-palette but not on-concept. Remove the 40px dial mark and the "Sign in to your panel" subtitle, and what's left is a stock centered SaaS auth card. DESIGN.md's "one authored moment", the needle sweep, happens at icon size. It settles in about 1.1s, and on a 1280px screen it's a speck. The page borrows none of the instrument vocabulary (tabular numerals, tracked uppercase labels). The copy ignores why most people arrive: holding a new unit and a claim code.
- **Detector:** clean on all three files, with zero findings and zero advisories. The overlay ran live in four states and reported "No anti-patterns found". Both reviewers found a real accessibility bug the detector can't see (P1-A below), so a clean detector result does not mean the page is clean.

### Priority issues
1. **[P1] The "Forgot password?" button breaks the password field's label.** `Login.tsx:134-157` wraps the button inside the password `<label>`. Browsers bind a label to the first labelable element inside it, so the label points at the button. Both assessments confirmed the effects in the accessibility tree:
   - The button is named "Password".
   - The password input has no label; its only name is its placeholder.
   - Clicking the word "Password" switches the page to reset mode.

   This fails WCAG 1.3.1 and 4.1.2. **Fix:** give the label `htmlFor` and the input an `id`, and move the button out of the label. Tab order should run Email → Password → Sign in. Suggested command: `/impeccable harden`.
2. **[P1] The page's own short-password error never appears.** `minLength` on the input makes the browser block the submit first, so users see the white native tooltip instead. **Fix:** add `noValidate`, drop the length check when signing in, and set `aria-invalid` / `aria-describedby` on the field. Also set `color-scheme: dark` so remaining native UI and autofill use dark styling. The same problem exists in `ResetPassword.tsx`. Suggested command: `/impeccable harden`.
3. **[P1] Contrast failures on non-text elements and the busy button.** Measured:
   - Input borders: panel-600 on the card is 1.57:1, below the 3:1 floor for UI boundaries (WCAG 1.4.11).
   - "Signing in…" button at `opacity-50`: 3.49:1, below 4.5:1.

   **Fix:** use a panel-500 input border, and replace the busy state's opacity with a solid muted fill plus `aria-busy`. Suggested command: `/impeccable polish`.
4. **[P2] A failed sign-in leaves the user with no way forward.** The page shows Supabase's raw message and moves focus to `<body>`. "Email not confirmed" has no resend option. **Fix:**
   - Rewrite the message in the product's words, e.g. "That email and password don't match".
   - Add an inline "Reset your password" link that keeps the email.
   - Add a resend-confirmation action.
   - Move focus to the error.

   Suggested command: `/impeccable clarify`.
5. **[P2] Nothing guides the first-timer, and signup barely looks different from sign-in.**
   - Signup looks like sign-in; only the button label and a dim subtitle change.
   - The signup success message sits in the error slot, then the page quietly switches to sign-in mode.
   - Nothing mentions claiming a device.

   **Fix:** replace the form with a dedicated "check your inbox" panel with resend and "wrong address?" actions. Give each mode a heading and a page title. Add one line pointing at the claim step. Suggested command: `/impeccable onboard`.

### Persona red flags
- **First-timer, device in hand, on a phone:** no mention of devices or claim codes. The mode switch is small secondary text. There's no password reveal. After the success message there's no next step, and the page silently switches to sign-in. The title wraps to two lines at 375px.
- **Returning owner at night on a phone:** "Invalid login credentials" is a dead end. The "Forgot password?" target is 16px tall. There's no reveal toggle. The expired-link page is still titled "Choose a new password".
- **Keyboard, screen-reader or password-manager user:**
  - The label bug (P1-A).
  - An extra tab stop between the two fields.
  - Focus drops to `<body>` after a mode change or an error.
  - The error is marked up twice, as `role=alert` inside an `aria-live` region.
  - Mode changes aren't announced.

### Minor observations
- **Layout:** the card jumps 40–90px whenever a message appears (vertical centering). Long email addresses overflow the notice box.
- **Sizing:** the inputs are 38px tall and the Forgot button 16px (target is 44px).
- **Colors:** the placeholder is Tailwind's cold gray-400 (#9ca3af). Its contrast is 7.4:1, so it passes, but it breaks the system's "warm, never gray" rule.
- **Mark animation:** the mark's glow doesn't fade in as DESIGN.md claims; the `filter` switches on instantly.
- **Reset page:** the "Send reset link" button stays live after sending. The expired-reset subtitle contradicts the page state.
- **Structure:** the page title never changes by mode, and there are no per-mode headings.
- **Inputs:** they have no `name` attributes, which weakens password managers.

### What's working
1. Password-reset copy that doesn't reveal which emails have accounts and says when the link expires (`Login.tsx:64`).
2. Palette and state discipline: amber for primary, red only for errors, orange for the expired link. Text contrast passes everywhere else (4.70–11.75:1). The focus ring is clear at 7.3:1.
3. Correct plumbing: the email is kept when switching modes, and `autocomplete` is set per mode. Reduced motion shows the mark at rest from the first frame. There's no horizontal overflow, and every submit button is above the fold at both viewports.

### Questions to consider
1. If the dial is the product's signature, why is it 40px on the one page everyone sees? What if an offline gauge sat at full size and woke up on sign-in?
2. Most first visits come with a device in hand. Should the entry point be "Claim your device", with the account created as part of claiming?
3. At 2am on a phone, is a password the right credential at all, or should it be a magic link or passkey?
