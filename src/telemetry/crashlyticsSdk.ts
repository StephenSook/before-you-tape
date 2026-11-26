// The two calls of the Crashlytics SDK the page uses, in a module of their own so the build gives the lazily loaded
// SDK its own named chunk (crashlyticsSdk-*.js), which the service worker leaves out of its cache.
export { getCrashlytics, recordError } from "firebase/crashlytics";
