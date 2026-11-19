# Known limits

What the app cannot catch on its own, and what it relies on the sender for.

- When a label has "ALCOHOL" at the end of one line and "FREE" at the start of the next, the app asks "Does the label say alcohol-free?". It takes the sender's answer as given: a "yes" on a label whose next line is really "FREE SHIPPING" reads "OK to pack".
- The rules behind each verdict were read on a stated date, and the app marks a layer stale once that read is older than its limit: 120 days for the USPS export rules, 60 days for a country's rules and customs notes, 21 days for USPS service suspensions. While any layer is stale, nothing reads "OK to pack"; it reads "Check this" until the rules are read again.
- "Today", for that count, is the calendar date on the sender's own device, in its own time zone. A device set to the wrong date counts the days wrong.
- Switching cloud checks off (`kill_cloud`) applies to every read that starts afterwards. A read already running when it is switched off can still finish: on Android one hybrid call may fall back to the cloud; on the web, a request already sent can finish; anything not yet sent, including an automatic retry or the fallback model, is not sent.
