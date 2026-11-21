import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { AboutPage } from "./pages/AboutPage";
import { BlindRoute } from "./pages/BlindRoute";
import { JudgeRoute } from "./pages/JudgeRoute";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PackRoute } from "./pages/PackRoute";
import { RanPage } from "./pages/RanPage";
import { RulesRoute } from "./pages/RulesRoute";

interface PageRoute {
  path: string;
  title: string;
}

const PUBLIC_ROUTES: readonly PageRoute[] = [
  { path: "/", title: "Pack your box" },
  { path: "/judge", title: "Try the sample box" },
  { path: "/rules", title: "Rules" },
  { path: "/ran", title: "What ran where" },
  { path: "/about", title: "About" },
  { path: "/blind/:token", title: "Blind check" },
];

// Development builds only. Vite replaces import.meta.env.DEV with false in production,
// so this table and its pages are left out of the production bundle (CI greps dist).
const DESK_ROUTES: readonly PageRoute[] = import.meta.env.DEV
  ? [
      { path: "/desk/listing", title: "Desk: listing" },
      { path: "/desk/eval", title: "Desk: eval" },
    ]
  : [];

function routeTable(dev: boolean): readonly PageRoute[] {
  return dev ? [...PUBLIC_ROUTES, ...DESK_ROUTES] : PUBLIC_ROUTES;
}

export function routePaths(dev: boolean): string[] {
  return routeTable(dev).map((r) => r.path);
}

// Routes with a built page. Every public route has one (a test holds that); only the development desk routes
// fall back to their title.
const PAGES: Record<string, ReactElement> = { "/": <PackRoute />, "/judge": <JudgeRoute />, "/about": <AboutPage />, "/rules": <RulesRoute />, "/ran": <RanPage />, "/blind/:token": <BlindRoute /> };

// The public pages that are built, for lists that must never point at a stub.
export function builtPagePaths(): string[] {
  return Object.keys(PAGES).filter((p) => !p.includes(":"));
}

export function AppRoutes() {
  return (
    <Routes>
      {routeTable(import.meta.env.DEV).map((r) => (
        <Route key={r.path} path={r.path} element={PAGES[r.path] ?? <h1>{r.title}</h1>} />
      ))}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
