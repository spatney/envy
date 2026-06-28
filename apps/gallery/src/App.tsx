import { lazy, type ComponentType } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Shell } from './components/shell/Shell';

/** Lazy-load a named page export so each route is code-split and isolated. */
function page<T extends Record<string, ComponentType<unknown>>>(
  loader: () => Promise<T>,
  name: keyof T,
) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType<unknown> })));
}

const Home = page(() => import('./pages/Home'), 'Home');
const Foundations = page(() => import('./pages/Foundations'), 'Foundations');
const Formatting = page(() => import('./pages/Formatting'), 'Formatting');
const Interactivity = page(() => import('./pages/Interactivity'), 'Interactivity');
const Ssr = page(() => import('./pages/Ssr'), 'Ssr');
const Mcp = page(() => import('./pages/Mcp'), 'Mcp');
const Packages = page(() => import('./pages/Packages'), 'Packages');
const ReactUsage = page(() => import('./pages/ReactUsage'), 'ReactUsage');
const Playground = page(() => import('./pages/Playground'), 'Playground');
const StoryRoute = page(() => import('./pages/StoryRoute'), 'StoryRoute');

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="foundations" element={<Foundations />} />
          <Route path="charts/:id" element={<StoryRoute />} />
          <Route path="formatting" element={<Formatting />} />
          <Route path="interactivity" element={<Interactivity />} />
          <Route path="ssr" element={<Ssr />} />
          <Route path="mcp" element={<Mcp />} />
          <Route path="packages" element={<Packages />} />
          <Route path="react" element={<ReactUsage />} />
          <Route path="playground" element={<Playground />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
