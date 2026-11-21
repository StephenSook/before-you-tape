// How long the Pack page waits for a read or a second look. A read past it adds no card, and a second look past it
// leaves the first verdict in place. The eval runner waits the same.
export const READ_TIMEOUT_MS = 45_000;
