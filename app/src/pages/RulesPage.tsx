import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PUZZLE_TYPES } from '../domain/board'
import { PUZZLE_TYPE_LABEL } from '../domain/games'

export function RulesPage() {
  const { hash } = useLocation()

  useEffect(() => {
    // HashRouter keeps section anchors inside its route; the browser cannot scroll to them itself.
    const target = document.getElementById(hash.replace(/^#/, ''))
    target?.scrollIntoView()
    target?.focus({ preventScroll: true })
  }, [hash])

  return (
    <section className="rules">
      <h1 className="page-title">How to play</h1>
      <p className="status">
        Fresh Queens, Star Battle, Train Tracks and Word Paths puzzles arrive every day.
        Past puzzles stay in the <Link to="/archive">archive</Link>.
      </p>
      <nav className="game-picker" aria-label="Game rules">
        {PUZZLE_TYPES.map((type) => (
          <Link key={type} to={{ pathname: '/how-to-play', hash: `#${type}` }}>
            {PUZZLE_TYPE_LABEL[type]}
          </Link>
        ))}
      </nav>

      <h2 id="controls" tabIndex={-1}>Shared controls</h2>
      <p>Tap or click to play. Each game&rsquo;s gestures and shortcuts are listed below.
        On a touch screen, drag on the board to play and scroll outside it to move the page.</p>
      <table className="controls">
        <thead><tr><th scope="col">Input</th><th scope="col">Action</th></tr></thead>
        <tbody>
          <tr><th scope="row">Tab, then arrow keys</th><td>Enter the board, then move between cells.</td></tr>
          <tr><th scope="row">Home / End</th><td>Move to the first or last cell in the row.</td></tr>
          <tr><th scope="row">Ctrl / Cmd + Z</th><td>Undo, just like the Undo button. A whole drag counts as one move.</td></tr>
        </tbody>
      </table>
      <p>Reset clears your attempt; the timer keeps running. You can Undo a reset.
        Rules links inside a game open a new tab so you can consult them without leaving your board.</p>

      <h2 id="queens" tabIndex={-1}>Queens</h2>
      <h3>Rules</h3>
      <ul>
        <li>Place exactly one queen in each row, each column and each coloured region.</li>
        <li>Queens cannot touch, including diagonally. Distant diagonal queens are allowed.</li>
        <li>Crosses are optional working notes and are not checked as part of the solution.</li>
      </ul>
      <h3>Controls</h3>
      <p>Tap or click cycles a cell: empty → cross → queen → empty. Drag to add crosses;
        start on a cross to erase crosses instead. Right-click toggles a cross.</p>
      <p>Enter or Space places or removes a queen. X toggles a cross; Delete or Backspace
        clears the cell. See <Link to={{ pathname: '/how-to-play', hash: '#crosses' }}>auto-mark</Link> for optional automatic crosses.</p>
      <h3>Hints</h3>
      <p>Use Hint or H to ask for a forced move and its explanation. Clear conflicts first.
        If no move can be explained, the app says so rather than guessing.
        Hints actually shown count in your result.</p>

      <h2 id="star-battle" tabIndex={-1}>Star Battle</h2>
      <h3>Rules</h3>
      <ul>
        <li>Fill each coloured region with exactly the number of stars printed in it.</li>
        <li>Each row and column must contain the same number of stars. Daily boards require two.</li>
        <li>Stars cannot touch, including diagonally. Crosses are optional notes.</li>
      </ul>
      <h3>Controls</h3>
      <p>Use the same controls as Queens, with stars in place of queens:
        tap cycles empty → cross → star → empty; drag adds or erases crosses;
        right-click or X toggles a cross. Enter or Space toggles a star;
        Delete or Backspace clears the cell. Star Battle has no hints.</p>
      <h3 id="crosses" tabIndex={-1}>Crosses and auto-mark</h3>
      <p>For Queens and Star Battle, a cross marks a cell you have ruled out. The app
        does not validate crosses, so you can accidentally rule out a correct cell.</p>
      <p>Auto-mark starts off and remembers your choice. In Queens, placing a queen
        crosses the rest of its row, column and region, plus touching cells.
        In Star Battle, placing a star crosses only touching cells.</p>

      <h2 id="train-tracks" tabIndex={-1}>Train Tracks</h2>
      <h3>Rules</h3>
      <ul>
        <li>Build one continuous track between the two fixed edge ends. Other cells may remain empty.</li>
        <li>Every track arm must connect to a matching arm in the next cell.
          All track pieces must belong to the same route, with no closed loops.</li>
        <li>The numbers beside each row and column count the cells occupied by track.
          Meet every count exactly.</li>
        <li>Given pieces cannot be changed. They include both ends of the route.</li>
      </ul>
      <p>Choose Small (8×8), Medium (10×10) or Large (12×12). These are board sizes,
        not difficulty ratings. Train Tracks has no hints.</p>
      <h3 id="notes" tabIndex={-1}>Controls, notes and the picker</h3>
      <p>Choose a straight, turn, note or eraser from the picker, then tap or drag across
        cells to apply it. Tapping a cell that already holds your selection clears it.
        Right-click erases a cell without changing your selection.</p>
      <ul>
        <li><strong>×</strong> means no track goes here.</li>
        <li><strong>?</strong> means a track goes here, but you have not chosen its direction.</li>
      </ul>
      <p>Notes do not count as track pieces. The app does not validate them.</p>
      <p>Keys 1–6 place the corresponding track piece in the focused cell.
        X places ×; ? places an undecided note. Delete or Backspace clears the cell;
        Enter or Space applies the selected picker entry.</p>

      <h2 id="word-paths" tabIndex={-1}>Word Paths</h2>
      <h3>Rules</h3>
      <ul>
        <li>Trace words through adjoining letters, moving up, down, left or right.</li>
        <li>Use every available letter exactly once, with one word of each shown length.</li>
        <li>Blocked cells and letters in accepted words cannot be selected.</li>
        <li>Any word accepted by the board&rsquo;s English word list counts;
          you do not have to find a particular set of answers. An accepted word can still lead to a dead end.</li>
      </ul>
      <h3>Controls</h3>
      <p>Drag through letters and release to submit, or tap letters and press Submit.
        Space selects the focused letter; Enter submits. Backspace removes the last
        selected letter; Escape clears the selection. Undo removes the last accepted word.</p>
      <p>The vocabulary is finite and does not recognize every English word.
        Newer boards use a broader acceptance list while generated answers stay familiar.
        See the <a href={`${import.meta.env.BASE_URL}word-paths-vocabulary-notice.txt`}>word list credits</a>.</p>
      <p><Link to="/preview/word-paths">Try the Word Paths preview</Link>.
        Preview progress is saved separately and does not affect daily stats.</p>

      <h2>Finishing, sharing and stats</h2>
      <p>A solved board locks and offers a result to share, optionally including the finished
        board as a spoiler. Your first solve of each puzzle is recorded; replaying it does
        not overwrite that time. Each Train Tracks size counts as its own puzzle.</p>
      <p>Stats stay in this browser, with no account or uploads. Clearing site data removes
        them. A streak counts each day once, however many puzzles you solve.</p>

      <h2>Add to your Home Screen</h2>
      <ol>
        <li>Open <Link to="/">Today&rsquo;s puzzles</Link> in Safari on iPhone.</li>
        <li>Tap Share, then Add to Home Screen.</li>
        <li>Keep Open as Web App enabled if it appears, then tap Add.</li>
      </ol>
      <p>Open the new icon to play in its own window. The first visit needs internet.
        Auto appearance follows your device settings. Safari and the Home Screen app
        keep separate progress and stats.</p>

      <h2>Playing offline</h2>
      <p>Wait for “App ready offline”, then open the puzzles you want while online.
        Today saves its available boards; browsing the archive saves the boards it loads.
        These boards can reopen without a connection. New or unsaved boards need internet;
        if a download warning appears, keep a connection to play them.</p>
      <p>Train Tracks and Word Paths keep unfinished progress. Queens and Star Battle
        restart unfinished attempts on reload. Clearing site data or browser cache eviction
        can remove downloads. Saved data belongs to this browser or Home Screen app.</p>
      <p>Updates wait until all Daily Puzzles windows are closed. Finish your game,
        then close and reopen them to use an update.</p>
      <p className="status">Ready? <Link to="/">Pick today&rsquo;s puzzles</Link>.</p>
    </section>
  )
}
