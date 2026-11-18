# USPS rules on alcohol in toiletries (read 2026-11-18)

The engine has to decide what to do with perfume, hand sanitizer, and lotions or creams that list alcohol. This file holds the lines it rests on. Each quote was copied from the live page on 2026-11-18 and then checked, word for word, against the fetched page text by a script.

## What the engine does

| Item | Verdict | Rule |
|------|---------|------|
| Perfume, cologne or fragrance that contains alcohol | Take it out | `USPS-INTL-FLAMMABLE-LIQUID` |
| Hand sanitizer, by category or by the word "sanitizer" on the label | Take it out | `USPS-INTL-FLAMMABLE-LIQUID` |
| Lotion or cream whose label says flammable | Take it out | `USPS-INTL-FLAMMABLE-LIQUID` or `USPS-INTL-FLAMMABLE-OTHER` |
| Lotion or cream that lists alcohol and does not say flammable | Check this | `USPS-INTL-ALCOHOL-LOTION` |
| Lotion or cream that is alcohol-free | OK to pack (when nothing else applies) | none |

## Perfume with alcohol: prohibited

- https://www.usps.com/international/shipping-restrictions.htm, under "Internationally Prohibited Items": "These items may not be sent from the United States to any country" ... "Perfumes (containing alcohol)"
- https://www.usps.com/ship/shipping-restrictions.htm, under "Perfumes": "Perfume containing alcohol may not be shipped internationally or mailed domestically using air transportation."

## Hand sanitizer: prohibited

- https://www.usps.com/ship/shipping-restrictions.htm, under "Hand Sanitizer": "Most hand sanitizers, including wipes, contain alcohol and are flammable in nature and are therefore handled and shipped as hazardous matter (HAZMAT) in the U.S. Mail." ... "It is prohibited to send these materials by International Mail including APO/FPO/DPO (military) destinations."
- https://pe.usps.com/text/pub52/pub52apxc_013.htm, Packaging Instruction 3D (Ethanol-based Flammable Liquids and Solids), under "Mailability": "International Mail and APO/FPO/DPO: Prohibited."

## Lotions and creams that list alcohol: not named

No page below names lotions, creams or "alcohol denat". The test USPS gives is the flash point of the liquid, which a label almost never shows. That is why the engine asks the sender to check instead of deciding.

- https://pe.usps.com/text/imm/immc1_015.htm, IMM 136.1: dangerous goods "are prohibited in outbound international mail, regardless of mail class." Under "Flammable materials": "Pyrophoric, flammable, or combustible liquids with a closed cup flash point below 200°F."
- https://pe.usps.com/text/pub52/pub52c3_022.htm, Pub 52 343.1: "A liquid with a flashpoint above 200° F (93° C) is not regulated as a hazardous material and may be mailed subject to the general packaging requirements in DMM 601, provided it possesses no characteristics of another hazard class."
- The same page, 343.21a: "International Mail: Flammable liquids are prohibited." And 343.22a: "International Mail: Combustible liquids are prohibited."

## What these pages do not say

- None of them says a small amount of alcohol is fine in international mail.
- None of them uses the word "flammable" on a label as the test. The engine treats that word as a strong sign, not as the USPS rule.
- Country listings can add their own limits. Those are read separately, per destination.
