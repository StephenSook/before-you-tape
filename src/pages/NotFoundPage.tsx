// Any path the app does not know. The same words as public/404.html, which hosting serves with a 404 status.
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <>
      <h1>Page not found</h1>
      <p>No page lives at this address.</p>
      <p>
        <Link to="/" className="button-like">Pack a box</Link>{" "}
        <Link to="/judge" className="button-like">Judges: start here</Link>
      </p>
    </>
  );
}
