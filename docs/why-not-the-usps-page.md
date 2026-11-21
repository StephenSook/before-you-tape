# Why not just read the USPS page?

USPS already publishes the rules for each country. Before You Tape does not replace those rules. It
uses them. This page says what the USPS pages give you, and what the app adds on top.

Checked on the live USPS pages on 2026-11-21.

## What the USPS pages give you

**The country listing.** USPS publishes a "Country Conditions for Mailing" page for each country in the
International Mail Manual. To find one, you pick the country from a list of links on the "Index of Countries
and Localities" page (https://pe.usps.com/text/imm/immctry.htm). For the Philippines
(https://pe.usps.com/text/imm/ps_006.htm), the page gives:

- Prohibitions, as text. One line reads: "Liquids, easily liquefiable items, and glass or similarly fragile
  articles."
- Restrictions, as text, for example limits on coffee for personal use, and the papers that plants need.
- Observations, for example that commercial invoices with a dutiable value of 3000 pesos and above need the
  Philippine Consulate's authentication and a U.S. $30 fee.
- For each mail service: weight limits, size limits, insurance, and the customs form to use.

**The international restrictions page.** A separate page
(https://www.usps.com/international/shipping-restrictions.htm) lists items that "may not be sent from the
United States to any country", among them aerosols, nail polish and perfumes containing alcohol. It also says
that only lithium batteries "properly installed in the equipment they are intended to operate" may be mailed
internationally. The Philippines listing does not repeat these rules, so a sender has to read both pages.

**The price calculator.** The Retail Postage Price Calculator (https://postcalc.usps.com/) asks for a
destination country, ZIP codes, the value, and each item's description, quantity and weight, and gives prices.
We did not run it with a country chosen, so this page makes no claim about what it shows after that.

All of these are text for a person to read and apply. None of them looks at your item.

## What Before You Tape adds

1. **It reads the item from a photo.** You point the camera at the item, or pick a photo. The app reads the
   item's name, its label text, and any battery numbers printed on it (volts, mAh and Wh).
2. **It decides what the item counts as.** The USPS pages use words like "easily liquefiable items" and
   "aerosols". The app puts each item in a category and gives it the tags those rules name, so a lotion
   counts as easily liquefiable and a spray can counts as an item under pressure, which the aerosol rule
   covers.
3. **It checks the whole box, not one item.** Publication 52 allows at most 4 lithium cells or 2 lithium
   batteries in one box, installed in their devices, and not both kinds. The app counts across every item in
   the box (`src/engine/lithiumBox.ts`). Neither USPS page above states that count.
4. **It checks the battery numbers.** It checks a battery's watt-hours against the Publication 52 limit (a
   lithium-ion battery above 100 Wh can't go by international mail), and it checks that the printed volts
   times mAh agree with the printed Wh. When they do not agree, it does not trust the printed Wh
   (`src/engine/battery.ts`).
5. **It links each verdict to its USPS line.** Each "Take it out" or "Check this" names the published rule it
   rests on, as a link to that page (`src/ui/ItemCard.tsx`). The app's own checks are named as the app's, not
   as USPS rules.
6. **It works before you tape.** You check each item at the packing table, while the box is still open, and
   the app keeps the list of what is in the box as you pack.

## What the app does not do

- It covers two destinations, Canada and the Philippines. The USPS listings cover every country.
- It does not give prices, size limits or customs forms. Use the USPS pages and the calculator for those.
- It can misread a photo. When it is not sure, it says "Check this" rather than "OK to pack".

## Chocolate, as an example of a country rule

Rules for food differ by country. For the Philippines, the app gives chocolate "Check this", under the
Philippines line about liquids and easily liquefiable items, because chocolate can melt. The listing does not
name chocolate, so the app asks you to check rather than telling you to take it out. This page makes no claim
about chocolate rules for any other country.
