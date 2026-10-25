# Statistics: AI model identities — 25 October 2026

Statistics has two presentation tabs: **Personaje** (existing portraits) and **Modele AI** (the assigned model as the primary identity). Both render the same ordered list and the same agent statistics, career XP/rank, predictions and model usage. They do not merge two agents that happen to share a model. The UI explains that histories can include fallback models; this is not a controlled model benchmark.

The AI view uses `vedere=modele` and preserves the chosen month and personal/community scope across navigation. Model names come from the current assignment, with the observed historical model as a fallback when no assignment exists. Unknown model IDs stay readable rather than being replaced with a hardcoded default.

Each AI card preserves the character name, role, specialty and existing risk/maximum odds/minimum probability settings, exposed as presentation metadata by agentStats. No prompts, votes, model routing, budgets, settlement rules or records were changed. Corina and SCOUT remain editorial with no voting XP.

Design: keep the existing four-column compact collectible-card layout and rarity colors. Midnight navy #0a1020, slate #b6c1d5, cool white #eef4ff, mint #80e1c5 and gold #e5c477 stay the base. Existing display typography is retained; model names have a two-line heading area. Distinctive fictional synthetic portraits provide the visual identity, while the surrounding statistics stay quiet and consistent. Portraits are 96×100 CSS pixels, not oversized character posters.

Assets: 24 original raster portraits generated with the **built-in image_gen tool**, one prompt per agent. They are artistic unofficial interpretations, with no corporate logos or real-person likenesses. Production assets are in `public/ai-portraits/*-v1.webp`, resized to a maximum of 384px and WebP encoded (715,132 bytes total, about 699 KiB for the entire set). Only image size/encoding was optimized; original generated PNGs remain in the Codex generated-images directory. Images load lazily.

Prompt set: [ai-portraits-prompts.json](ai-portraits-prompts.json). Each entry records the subject, role, model inspiration and generation prompt. The portrait follows the role/agent identity, while its model label follows the live assignment.

Validation: 155 unit/integration tests pass and production build passes. CUA local browser comparison of all 24 cards confirmed unchanged ordering, results, rarity, XP and history counts between views. Personal/community and month navigation preserve the model view and career level. Existing E2E specs were extended with identity/filter preservation coverage; the automated Playwright suite was not run. Local verification used synthetic records and fake providers; no production AI analysis was started.
