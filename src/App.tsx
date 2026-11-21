import { BrowserRouter, Link, NavLink } from "react-router-dom";
import { UpdateLine } from "./pwa/UpdateLine";
import { AppRoutes } from "./routes";

// The built pages a visitor can reach from any page; a page joins this list only once it is built.
const NAV: readonly [string, string][] = [["Sample box", "/judge"], ["Rules", "/rules"], ["What ran where", "/ran"], ["About", "/about"]];

export default function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <Link to="/" className="wordmark" data-testid="wordmark">Before You Tape</Link>
        <nav aria-label="Pages">
          {NAV.map(([label, to]) => <NavLink key={to} to={to} className="nav-pill" data-testid="nav-pill">{label}</NavLink>)}
        </nav>
      </header>
      <UpdateLine />
      <main>
        <AppRoutes />
      </main>
      <footer className="site-footer">
        <p>Not affiliated with or approved by the US Postal Service.</p>
      </footer>
    </BrowserRouter>
  );
}
