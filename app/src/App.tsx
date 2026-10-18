import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import { Shell } from './components/Shell'
import { ArchivePage } from './pages/ArchivePage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PuzzlePage } from './pages/PuzzlePage'
import { RulesPage } from './pages/RulesPage'
import { StarBattlePage } from './pages/StarBattlePage'
import { StatsPage } from './pages/StatsPage'
const WordPathsPreviewPage = lazy(() => import('./pages/WordPathsPreviewPage').then((module) => ({ default: module.WordPathsPreviewPage })))

const TrioPreviewPage = lazy(() => import('./pages/TrioPreviewPage').then((module) => ({ default: module.TrioPreviewPage })))

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="archive/:id" element={<PuzzlePage />} />
          <Route path="star-battle" element={<StarBattlePage />} />
          <Route path="preview/word-paths" element={<Suspense fallback={<p className="status">Loading preview…</p>}><WordPathsPreviewPage /></Suspense>} />
          <Route path="preview/trio" element={<Suspense fallback={<p className="status">Loading preview…</p>}><TrioPreviewPage /></Suspense>} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="how-to-play" element={<RulesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App