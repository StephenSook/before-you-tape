// No call that can reach the cloud starts before anonymous sign-in has finished, so Firebase AI Logic can
// require a signed-in user (the checklist's authenticated-users mode) without breaking a read. The
// device-only port never touches the network, so it never waits and works offline.
import { ReadFailure } from "./itemRead";
import type { ItemModels, ModelPort } from "./port";

function waitFor(signIn: Promise<string>, inner: ModelPort): ModelPort {
  return {
    async generate(prompt, image, opts) {
      try {
        await signIn;
      } catch {
        throw new ReadFailure("cloud_unreachable", "not signed in, so the cloud check did not run");
      }
      // The sender or the pause may have withdrawn the cloud while sign-in was finishing.
      if (opts?.signal?.aborted || (opts?.allowed && !opts.allowed())) throw new ReadFailure("blocked", "cloud checks were switched off during sign-in");
      return opts ? inner.generate(prompt, image, opts) : inner.generate(prompt, image);
    },
  };
}

export function afterSignIn(models: ItemModels, signIn: Promise<string>): ItemModels {
  const gated: ItemModels = { device: models.device, hybrid: waitFor(signIn, models.hybrid), cloud: waitFor(signIn, models.cloud) };
  if (models.fallback) gated.fallback = waitFor(signIn, models.fallback);
  return gated;
}
