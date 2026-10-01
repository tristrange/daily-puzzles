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

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="archive/:id" element={<PuzzlePage />} />
          <Route path="star-battle" element={<StarBattlePage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="how-to-play" element={<RulesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App