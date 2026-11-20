# Known limits

What the app cannot catch on its own, and what it relies on the sender for.

- When a label has "ALCOHOL" at the end of one line and "FREE" at the start of the next, the app asks "Does the label say alcohol-free?". It takes the sender's answer as given: a "yes" on a label whose next line is really "FREE SHIPPING" reads "OK to pack".
- The rules behind each verdict were read on a stated date, and the app marks a layer stale once that read is older than its limit: 120 days for the USPS export rules, 60 days for a country's rules and customs notes, 21 days for USPS service suspensions. While any layer is stale, nothing reads "OK to pack"; it reads "Check this" until the rules are read again.
- "Today", for that count, is the calendar date on the sender's own device, in its own time zone. A device set to the wrong date counts the days wrong.
- Switching cloud checks off (`kill_cloud`) applies to every read that starts afterwards. A read already running when it is switched off can still finish: on Android one hybrid call may fall back to the cloud; on the web, a request already sent can finish; anything not yet sent, including an automatic retry or the fallback model, is not sent.
- A box open in one tab or device does not update while another changes it. Each edit saves only the item it touched, so neither overwrites the other, but the box on screen, and its verdict, shows the other's changes only after a reload.
- Opening a box never writes to it. An item saved with a second look that was changed elsewhere since opens held at "Check this", and that held state is saved only when the sender next edits the item; until then a reload holds it again.
- A saved box this device is not allowed to read (for example one made by another sign-in on the same browser) stays "could not be opened". New edits stay on this device and are not saved; the app does not start a new box in its place.
- An item changed on one device while it was offline, and removed on another device meanwhile, comes back when the first device saves its change: the saves go item by item, and the later save wins.
- Android does not run the cloud second look. On a phone with an on-device model, that one read and the rules decide, and the card says which read it was.
