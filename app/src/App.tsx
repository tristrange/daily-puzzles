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
const LearnPage = lazy(() => import('./pages/LearnPage').then((module) => ({ default: module.LearnPage })))
const SudokuLessonPage = lazy(() => import('./pages/SudokuLessonPage').then((module) => ({ default: module.SudokuLessonPage })))
const SudokuCoursePage = lazy(() => import('./pages/SudokuCoursePage').then(module => ({ default: module.SudokuCoursePage })))
const StarBattleCoursePage = lazy(() => import('./pages/StarBattleCoursePage').then(module => ({ default: module.StarBattleCoursePage })))
const StarBattleLessonPage = lazy(() => import('./pages/StarBattleLessonPage').then(module => ({ default: module.StarBattleLessonPage })))
const TrioCoursePage = lazy(() => import('./pages/TrioCoursePage').then(module => ({ default: module.TrioCoursePage })))
const TrioLessonPage = lazy(() => import('./pages/TrioLessonPage').then(module => ({ default: module.TrioLessonPage })))
const GridCoursePage = lazy(() => import('./pages/GridLessonPages').then(module => ({ default: module.GridCoursePage })))
const GridLessonPage = lazy(() => import('./pages/GridLessonPages').then(module => ({ default: module.GridLessonPage })))
const QueensCoursePage = lazy(() => import('./pages/QueensLessonPages').then(module => ({ default: module.QueensCoursePage })))
const QueensLessonPage = lazy(() => import('./pages/QueensLessonPages').then(module => ({ default: module.QueensLessonPage })))
const TrioPreviewPage = lazy(() => import('./pages/TrioPreviewPage').then((module) => ({ default: module.TrioPreviewPage })))
const NurikabePreviewPage = lazy(() => import('./pages/NurikabePreviewPage').then((module) => ({ default: module.NurikabePreviewPage })))
const TentsPreviewPage = lazy(() => import('./pages/TentsPreviewPage').then((module) => ({ default: module.TentsPreviewPage })))
const KillerSudokuPreviewPage = lazy(() => import('./pages/KillerSudokuPreviewPage').then((module) => ({ default: module.KillerSudokuPreviewPage })))
const SudokuPreviewPage = lazy(() => import('./pages/SudokuPreviewPage').then((module) => ({ default: module.SudokuPreviewPage })))
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
            <Route path="preview/nurikabe" element={<NurikabePreviewPage />} />
            <Route path="preview/tents" element={<TentsPreviewPage />} />
            <Route path="preview/sudoku" element={<SudokuPreviewPage />} />
            <Route path="preview/killer-sudoku" element={<KillerSudokuPreviewPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="learn" element={<LearnPage />} />
            <Route path="learn/queens" element={<QueensCoursePage />} />
            <Route path="learn/queens/:lessonId" element={<QueensLessonPage />} />
            <Route path="learn/trio" element={<TrioCoursePage />} />
            <Route path="learn/trio/:lessonId" element={<TrioLessonPage />} />
            <Route path="learn/nurikabe" element={<GridCoursePage kind="nurikabe" />} />
            <Route path="learn/nurikabe/:lessonId" element={<GridLessonPage kind="nurikabe" />} />
            <Route path="learn/tents" element={<GridCoursePage kind="tents" />} />
            <Route path="learn/tents/:lessonId" element={<GridLessonPage kind="tents" />} />
            <Route path="learn/train-tracks" element={<GridCoursePage kind="train-tracks" />} />
            <Route path="learn/train-tracks/:lessonId" element={<GridLessonPage kind="train-tracks" />} />
            <Route path="learn/sudoku" element={<SudokuCoursePage />} />
            <Route path="learn/star-battle" element={<StarBattleCoursePage />} />
            <Route path="learn/star-battle/:lessonId" element={<StarBattleLessonPage />} />
            <Route path="learn/sudoku/:lessonId" element={<SudokuLessonPage />} />
            <Route path="how-to-play" element={<RulesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  )
}

export default App
