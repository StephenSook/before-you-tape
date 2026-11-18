import { BrowserRouter, Link } from "react-router-dom";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <BrowserRouter>
      <header>
        <Link to="/">Before You Tape</Link>
      </header>
      <main>
        <AppRoutes />
      </main>
      <footer>
        <p>Not affiliated with or approved by the US Postal Service.</p>
      </footer>
    </BrowserRouter>
  );
}
