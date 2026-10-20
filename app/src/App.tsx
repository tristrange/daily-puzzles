import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import { Shell } from './components/Shell'
import { HomePage } from './pages/HomePage'
import { LeaderboardGate } from './components/LeaderboardGate'

const ArchivePage = lazy(() => import('./pages/ArchivePage').then((module) => ({ default: module.ArchivePage })))
const LeaderboardsPage = lazy(() => import('./pages/LeaderboardsPage').then((module) => ({ default: module.LeaderboardsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const PuzzlePage = lazy(() => import('./pages/PuzzlePage').then((module) => ({ default: module.PuzzlePage })))
const RulesPage = lazy(() => import('./pages/RulesPage').then((module) => ({ default: module.RulesPage })))
const StarBattlePage = lazy(() => import('./pages/StarBattlePage').then((module) => ({ default: module.StarBattlePage })))
const StatsPage = lazy(() => import('./pages/StatsPage').then((module) => ({ default: module.StatsPage })))
const TrioPreviewPage = lazy(() => import('./pages/TrioPreviewPage').then((module) => ({ default: module.TrioPreviewPage })))
const WordPathsPreviewPage = lazy(() => import('./pages/WordPathsPreviewPage').then((module) => ({ default: module.WordPathsPreviewPage })))

const loading = <p className="status" role="status">Loading…</p>

function App() {
  return (
    <HashRouter>
      <Suspense fallback={loading}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="archive" element={<ArchivePage />} />
            <Route element={<LeaderboardGate />}>
              <Route path="archive/:id" element={<PuzzlePage />} />
              <Route path="star-battle" element={<StarBattlePage />} />
              <Route path="leaderboards" element={<LeaderboardsPage />} />
            </Route>
            <Route path="preview/word-paths" element={<WordPathsPreviewPage />} />
            <Route path="preview/trio" element={<TrioPreviewPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="how-to-play" element={<RulesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  )
}

export default App
