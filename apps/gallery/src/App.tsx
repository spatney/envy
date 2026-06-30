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
const Learn = page(() => import('./pages/Learn'), 'Learn');
const LearnChapter = page(() => import('./pages/LearnChapter'), 'LearnChapter');
const Charts = page(() => import('./pages/Charts'), 'Charts');
const StoryRoute = page(() => import('./pages/StoryRoute'), 'StoryRoute');
const GuideRoute = page(() => import('./pages/GuideRoute'), 'GuideRoute');
const Ssr = page(() => import('./pages/Ssr'), 'Ssr');
const Mcp = page(() => import('./pages/Mcp'), 'Mcp');
const Packages = page(() => import('./pages/Packages'), 'Packages');
const ReactUsage = page(() => import('./pages/ReactUsage'), 'ReactUsage');
const Reference = page(() => import('./pages/Reference'), 'Reference');
const Playground = page(() => import('./pages/Playground'), 'Playground');
const DashboardPlayground = page(() => import('./pages/DashboardPlayground'), 'DashboardPlayground');
const NotFound = page(() => import('./pages/NotFound'), 'NotFound');

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="learn" element={<Learn />} />
          <Route path="learn/:chapter" element={<LearnChapter />} />
          <Route path="charts" element={<Charts />} />
          <Route path="charts/:id" element={<StoryRoute />} />
          <Route path="guides/:topic" element={<GuideRoute />} />
          <Route path="ssr" element={<Ssr />} />
          <Route path="mcp" element={<Mcp />} />
          <Route path="packages" element={<Packages />} />
          <Route path="react" element={<ReactUsage />} />
          <Route path="reference" element={<Reference />} />
          <Route path="playground" element={<Playground />} />
          <Route path="playground/dashboard" element={<DashboardPlayground />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
