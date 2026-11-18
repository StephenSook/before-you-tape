// The private blind check (plan Task 30): a reviewer sees each item's photo and a destination and answers
// Ship, Don't ship or Depends. Nothing from the app is shown: no verdict, no reason, no read. Each answer is
// saved as it is given; sending locks the session so the answers cannot change.
import { useState } from "react";

export interface BlindItem { itemId: string; photo: string; alt: string; credit: string }
export type BlindCallValue = "ship" | "dont_ship" | "depends";
export interface BlindCall { itemId: string; destination: string; call: BlindCallValue }

export interface BlindPageProps {
  items: readonly BlindItem[];
  destinations: readonly { code: string; name: string }[];
  save: (call: BlindCall) => Promise<void>;
  submit: () => Promise<void>;
  locked: boolean;
}

const CHOICES: ReadonlyArray<[BlindCallValue, string]> = [["ship", "Ship"], ["dont_ship", "Don't ship"], ["depends", "Depends"]];
const key = (itemId: string, destination: string) => `${itemId}_${destination}`;

export function BlindPage({ items, destinations, save, submit, locked }: BlindPageProps) {
  const [calls, setCalls] = useState<Record<string, BlindCallValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(locked);
  const done = sent || locked;
  const total = items.length * destinations.length;
  const answered = Object.keys(calls).length;

  const choose = async (c: BlindCall) => {
    setError(null);
    try {
      await save(c);
      setCalls((all) => ({ ...all, [key(c.itemId, c.destination)]: c.call }));
    } catch {
      setError("Not saved. Check the connection and try again.");
    }
  };

  const send = async () => {
    setError(null);
    try {
      await submit();
      setSent(true);
    } catch {
      setError("Not sent. Check the connection and try again.");
    }
  };

  return (
    <main>
      <h1>Blind check</h1>
      <p>For each photo, would you let this item go to the country shown by Priority Mail International?</p>
      {done && <p role="status">Thank you. Your answers are in.</p>}
      {error && <p role="alert">{error}</p>}
      {items.map((item) => (
        <section key={item.itemId}>
          <img src={item.photo} alt={item.alt} width={320} />
          {destinations.map((d) => {
            const chosen = calls[key(item.itemId, d.code)];
            return (
              <div key={d.code} role="group" aria-label={`${item.alt}, to ${d.name}`}>
                <p>{d.name}</p>
                {CHOICES.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={chosen === value} disabled={done}
                    onClick={() => void choose({ itemId: item.itemId, destination: d.code, call: value })}>
                    {label}
                  </button>
                ))}
              </div>
            );
          })}
        </section>
      ))}
      {!done && (
        <p>
          <span>{answered} of {total} answered</span>{" "}
          <button type="button" disabled={answered < total} onClick={() => void send()}>Send my answers</button>
        </p>
      )}
      <footer>
        <h2>Photo credits</h2>
        <ul>{items.map((i) => <li key={i.itemId}>{i.credit}</li>)}</ul>
      </footer>
    </main>
  );
}
