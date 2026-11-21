# ADR 0001: iPhone app availability, export compliance and AI content

Date: 2026-11-21. Status: accepted.

## Context

- The iPhone app declares `ITSAppUsesNonExemptEncryption` as `false` (`ios/project.yml`).
- Its encryption is HTTPS through Apple's own system, and a standard TLS library that the Firebase
  SDK bundles for Firestore's networking (`openssl_grpc`, BoringSSL). The 1.0.0 (1) release binary
  carries it: 146 `openssl_grpc` or BoringSSL strings in `BYT`.
- Apple's rule: an app whose only encryption is standard algorithms is exempt from export
  documentation, except that a standard algorithm that is not part of the operating system needs
  documentation for France. Declaring `false` is right only if France is left out.
- Cloud checks send a photo crop or label words to Gemini through Firebase AI Logic. Apps in China
  mainland that offer generative AI need filings (and App Store Connect asks for them) that this app
  does not have.

## Decision

- App Store availability: every country and region except France and China mainland.
- `ITSAppUsesNonExemptEncryption` stays `false`. No export compliance documents are uploaded.
- The App Store review notes and `ios/app-store/listing.md` say both, in the same words.

## Consequences

- People in France and China mainland cannot download the iPhone app; the web app stays open to
  them.
- If the app ever ships its own non-standard encryption, or drops the bundled TLS library, this
  decision is read again: with no bundled library, France can be added back; with non-standard
  encryption, the declaration changes to `true` and documents are needed.
- Adding China mainland needs the generative-AI filings first.
