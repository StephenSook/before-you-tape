// /about: what the app does, what stays on the device and what can leave it, and the credits for every
// published test photo, each open license and source linked as those licenses ask.
import manifest from "../../eval/set/manifest.public.json";
import type { PublicSetManifest } from "../eval/loadSet";
import { OWN_PHOTO_LICENSE } from "../eval/manifest";
import { judgeNameOf } from "../judge/brandFree";
import { BOX_LIST_SAVED } from "../ui/boxListCopy";
import { READ_TIMING_SENT } from "../ui/readTimingCopy";
import { SOURCE_URL } from "../ui/sourceLink";

const items = (manifest as PublicSetManifest).items;

export function AboutPage() {
  return (
    <div className="about">
      <h1>About Before You Tape</h1>
      <p>Hold each gift up to your camera and see what the post office won't take, before you tape the box.</p>

      <h2>What it checks</h2>
      <p>
        Each item, against US Postal Service rules for international mail and the rules of the country you send to.
        It answers OK to pack, Check this or Take it out, and names the rule behind the answer.
      </p>

      <h2>What stays on this device</h2>
      <ul>
        <li>The rules run in your browser.</li>
        <li>A photo is read on this device when it has a built-in model.</li>
        <li>
          If it does not, or when the rules ask for a read to be checked again, and only if you allow it, the part of
          the photo inside the box you place goes to Google's Gemini through Firebase AI Logic. You can turn this off
          again at any time.
        </li>
        <li>{BOX_LIST_SAVED}</li>
        <li>{READ_TIMING_SENT}</li>
      </ul>
      <p>Not affiliated with or approved by the US Postal Service.</p>
      <p>
        <a href="/judge">Try the sample box</a> · <a href="/">Check your own box</a> ·{" "}
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">Source code on GitHub</a>
      </p>

      <h2>Photo credits</h2>
      <p>The test photos on this site. Each published copy was changed as noted.</p>
      <ul aria-label="Photo credits" className="credits">
        {items.map((i) => (
          <li key={i.itemId}>
            {judgeNameOf(i.itemId)}:{" "}
            {i.provenance.license === OWN_PHOTO_LICENSE ? "Photo by the project owner" : (
              <>
                Photo: {i.provenance.author},{" "}
                <a href={i.provenance.licenseUrl} target="_blank" rel="noreferrer">{i.provenance.license}</a>,{" "}
                <a href={i.provenance.sourcePage} target="_blank" rel="noreferrer">source</a> ({i.provenance.changes})
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
