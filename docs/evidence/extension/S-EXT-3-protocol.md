# S-EXT-3 | Product text quality protocol

Status: NOT RUN. Record the SHA-256 of this file before collecting samples.

Use the system prompt and JSON-encoded text input in src/ai/productText.ts. Use the item JSON schema from src/shared/itemRead.ts and the text-only settings in src/ai/firebaseModels.ts. Record the commit and Chrome version, flags, route and time for each run.

1. Collect 20 real shop descriptions outside the repo. Use 10 battery items, five liquids, sprays or alcohol items, and five plain goods.
2. Before running the model, tag each item by hand. Record its category, the printed battery numbers and the rule engine verdict from the hand-entered item for the selected destination. Keep the rule edition and sender answers the same for both verdicts.
3. Run each text in the built panel on the laptop. Keep text outside the repo. Record the text SHA-256, our hand labels, and the results.
4. Require zero unsupported numbers after grounding. Require zero cases where the hand-entered verdict is Take it out and the panel verdict is OK to pack.
5. Record whether the category matched in at least 16 of 20 cases, all printed battery numbers matched in at least seven of 10 cases, and verdicts matched in at least 17 of 20 cases.

There are no measured results yet.
