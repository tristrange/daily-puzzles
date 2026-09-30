import { HashRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import { Shell } from './components/Shell'
import { ArchivePage } from './pages/ArchivePage'
import { DailyPage } from './pages/DailyPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PuzzlePage } from './pages/PuzzlePage'
import { StatsPage } from './pages/StatsPage'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<DailyPage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="archive/:id" element={<PuzzlePage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App