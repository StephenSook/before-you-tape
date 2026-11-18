// No call that can reach the cloud starts before anonymous sign-in has finished, so Firebase AI Logic can
// require a signed-in user (the checklist's authenticated-users mode) without breaking a read. The
// device-only port never touches the network, so it never waits and works offline.
import { ReadFailure } from "./itemRead";
import type { ItemModels, ModelPort } from "./port";

function waitFor(signIn: Promise<string>, inner: ModelPort): ModelPort {
  return {
    async generate(prompt, image) {
      try {
        await signIn;
      } catch {
        throw new ReadFailure("cloud_unreachable", "not signed in, so the cloud check did not run");
      }
      return inner.generate(prompt, image);
    },
  };
}

export function afterSignIn(models: ItemModels, signIn: Promise<string>): ItemModels {
  const gated: ItemModels = { device: models.device, hybrid: waitFor(signIn, models.hybrid), cloud: waitFor(signIn, models.cloud) };
  if (models.fallback) gated.fallback = waitFor(signIn, models.fallback);
  return gated;
}
