// A country's English name as it reads after "for" or "to": "the Philippines", "Canada".
const TAKES_THE = /^(Philippines|Netherlands|Bahamas|Gambia|Maldives|Seychelles|Comoros|Vatican City)$|^(United |Dominican |Czech |Central African )|(Islands|Emirates|Republic)$/;

export function inCountry(name: string): string {
  return TAKES_THE.test(name) ? `the ${name}` : name;
}
