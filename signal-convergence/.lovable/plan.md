## Dossier header redesign

Two small, related tweaks on the dossier detail page (`/dossier/:id`):

1. **Move avatar to the left** in the header card.
2. **Remove the "How accurate is this dossier?" feedback strip** entirely and replace it with **two tiny monochrome thumb buttons in the top-right corner of the header card**.

```text
┌──────────────────────────────────────────────────────────┐
│  ⬛  Jane Doe                                  👍   👎    │
│      ┌ founder ┐ ┌ 92% confidence ┐ ┌ ready ┐            │
└──────────────────────────────────────────────────────────┘
```

### Changes

**`src/pages/Dossier.tsx`**
- Header card (lines ~140–171): swap the flex order so `EntityAvatar` sits on the left, name + meta pills on the right. Avatar stays at size 72.
- Add a small absolute-positioned cluster in the top-right of the header card with two icon-only thumb buttons:
  - 👍 → `submit({ verdict: "correct" })`
  - 👎 → `submit({ verdict: "wrong_target" })` (default "wrong" verdict; same one that flips the dossier to rejected)
  - Both rendered as monochrome ghost icon buttons (`h-8 w-8`, `text-muted-foreground hover:text-foreground`, lucide `ThumbsUp` / `ThumbsDown` at `h-4 w-4`, no fill, no color tint).
  - Toast on success ("Feedback recorded ✓" / "Marked as wrong, dossier rejected") via the existing `submitDossierFeedback` mutation logic moved inline into `Dossier.tsx`.
  - Disabled state with `Loader2` spinner while pending.
- **Remove** the `<DossierFeedbackStrip ... />` render (line 174) and its import.
- Keep the rejected banner, KB banner, key signals, convergence sections, etc. — all unchanged.

**`src/components/converge/DossierFeedbackStrip.tsx`**
- No longer used anywhere. Delete the file to keep the codebase clean.

### What goes away

- The whole "How accurate is this dossier?" card with its subtitle, "Looks right" green button, "Wrong" outline button, "More" dropdown (wrong target / spam / low priority), inline classification correction form, feedback history toggle, and confirm dialog. All of it is replaced by the two thumb icons.

### Out of scope

- No API changes.
- No changes to the dossier list page or anywhere else.
