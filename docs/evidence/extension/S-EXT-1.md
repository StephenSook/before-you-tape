# S-EXT-1 | Built-in model in a Chrome side panel

Status: NOT RUN. This needs a real laptop and Chrome with the built-in model. Local unit tests do not measure Chrome's model or network behavior.

Load the unpacked panel in a fresh stock Chrome profile and in a profile with the built-in model flags enabled. Record the Chrome version and flags for both.

1. Check the model API and record availability with text and with text plus an image.
2. Make five text reads. Check the item fields and the SDK route for each read. On the same network log, show that a public version file request appears and that no model host is called by the five reads.
3. Remove the browser model API in a separate spike build. Confirm the guard blocks the SDK call. Run the SDK-only fallback control against the reserved invalid host and inspect the network log.
4. In a profile where the model can be downloaded, click Get this laptop ready and record if the download finishes and how long it takes.
5. Check that the panel can read the public rule edition under the three existing permissions. Record the hosted response headers.
6. Click the toolbar on an HTTPS page and on the Chrome extensions page. Record whether the panel opens and which title and link the browser supplies.
