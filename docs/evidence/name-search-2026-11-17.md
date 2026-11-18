# Name search, 2026-11-17

Purpose: check that no existing GitHub project uses the name "Before You Tape".

Run on 2026-11-17 at 23:00 EST with the GitHub CLI (`gh search repos`, limit 50 per query):

| Query | Results | Any repository named Before You Tape |
|---|---|---|
| `"Before You Tape"` | 0 | no |
| `beforeyoutape` | 0 | no |
| `before-you-tape` | 19 | no (each result matched only the separate words, for example tape dispensers and coursework) |

Result: no GitHub project named "Before You Tape" was found.

This search covers public GitHub repositories only. It does not cover trademarks, app stores or other code hosts.
