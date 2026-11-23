# How we work: goal, orientation, standards

## Goal

BerryPDF is where anyone goes when they need to do something with a PDF. We give away for free what others charge for, and we do it better, privately and provably.

## Orientation

1. **Best result wins.** Choose the approach that gives the best output for the user, then make it private and cheap. Browser first, because it is private and free to run. Use the server when it is genuinely better, and always with the user's consent.
2. **Premium for free.** If a competitor puts a feature behind a paywall, a login or an hourly limit, we ship it free and unlimited, as long as it runs on the user's device or fits the ₹1000/month budget.
3. **Beat, don't just match.** Every feature is measured against the reference in the Parity Lab (`parity-lab.md`), down to milliseconds, bytes and pixels. A metric we lose is a bug.
4. **Never corrupt silently.** We verify our own output on every save (untouched content unchanged, text correct). If we can't do something perfectly, we say so in one line and offer the next best action.
5. **Minimal and calm.** Little text, tasteful motion, phone-first. Simple to use, sophisticated underneath.

## Standards

- **Evidence over assumption.** Facts about competitors come from measurement (network logs, output files, screenshots) or cited sources, tagged verified or unverified.
- **Clean room.** We study competitors' behaviour and their open code to learn techniques, and we write our own implementation. We never copy their code, text or assets (CLAUDE.md rules 1 and 3; AGPL code is read-only for us).
- **Permissive licences only**, checked before adding anything.
- **Respect others' services:** rate limits in CLAUDE.md rule 7, no evading bot protection, synthetic files only.
- **Small, verified steps.** One feature at a time through the pipeline (`workflow.md`), each gated by tests, review, the evaluator, and the Parity Lab score.
