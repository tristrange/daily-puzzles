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
        Fresh Queens, Star Battle, Train Tracks, Word Paths, Trio, Tents and Sudoku puzzles arrive every day.
        Past puzzles stay in the <Link to="/archive">archive</Link>.
      </p>
      <nav className="game-picker" aria-label="Game rules">
        {PUZZLE_TYPES.map((type) => (
          <Link key={type} to={{ pathname: '/how-to-play', hash: `#${type}` }}>
            {PUZZLE_TYPE_LABEL[type]}
          </Link>
        ))}
        <Link to={{ pathname: '/how-to-play', hash: '#nurikabe' }}>Nurikabe preview</Link>
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
          <tr><th scope="row">Ctrl / Cmd + Shift + Z<br />Ctrl + Y</th><td>Redo an undone move. Making a new move clears Redo.</td></tr>
        </tbody>
      </table>
      <p>Timers count only while the puzzle page is visible and focused. Switching tabs, minimizing the window or using another app pauses the clock. Reset asks for confirmation before clearing your moves. Total time and shown hints are kept, and a separate Since reset timer restarts. Undo restores the board without changing either timer.
        Undo and Redo history lasts while the puzzle is open and is cleared by reloading or leaving it.
        Rules links inside a game open a new tab so you can consult them without leaving your board.</p>

      <h2 id="tents" tabIndex={-1}>Tents</h2>
      <h3>Rules</h3>
      <ul>
        <li>Pair every tree with one tent directly above, below, left or right of it. Every tent needs its own tree.</li>
        <li>Tents cannot touch, including diagonally.</li>
        <li>Match the tent count beside every row and column. A zero means no tents in that line.</li>
        <li>A tent can border several trees, as long as all trees and tents can be paired one-to-one.
          You do not need to draw the pairings.</li>
        <li>Grass means no tent here. Grass marks are optional for completing the board.</li>
      </ul>
      <h3>Controls and hints</h3>
      <p>Pick Tent, Grass or Erase, then tap or drag. Tapping the selected mark again clears it.
        Right-click erases. Trees are fixed. 1 or T places a tent; 2 or G marks grass;
        Enter or Space applies the picker; Delete or Backspace erases.</p>
      <p>Hint or H explains a deduction from tree adjacency, non-touching or line counts.
        It can also compare the possible arrangements of one row or column: if all
        use a cell it must be a tent; if none use it, mark grass. Short lists of
        remaining positions are shown in the explanation.
        Apply move places a tent or grass as one undoable move. Target and support cells
        are highlighted. Your tents and grass are assumptions; a mistaken mark can mislead hints.
        Hints may run out before you finish; a stall is reported without guessing. Shown hints are counted even if undone or reset.</p>
      <p><Link to="/preview/tents">Try the Tents previews</Link>. Each has a verified unique
        tent placement. Preview attempts save separately and do not affect daily stats or leaderboards.
        Boards 1–6 are 8×8; Boards 7–9 are a larger 10×10 playtest. Boards 4–9 use every row and column.
        Both sizes support explained hints, including row and column arrangements.
        These boards are for playtesting; no difficulty rating is claimed.</p>

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
      <p>Use Hint or H to ask for help. It checks for a misplaced queen first, then a
        cross that blocks a required queen, before explaining a forced move.
        If your entries lead to a contradiction, it warns without identifying a cell.
        Choose Show the mistake to reveal one correction, or dismiss it and keep solving.
        If verification or deduction cannot finish, the app says so rather than guessing.
        Revealed corrections and deductions count as hints; the initial warning does not.</p>
      <p>The solid outline marks the target; dashed outlines show supporting cells.
        Apply move clears the highlighted mistake, places the queen or adds a cross as one undoable move. Use the
        location link to return to the target, or Escape to dismiss the explanation.
        Checking against the unique solution happens only when you request Hint.</p>

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
        Delete or Backspace clears the cell.</p>
      <h3>Hints</h3>
      <p>Use Hint or H for an explained, forced move, just as in Queens.
        It checks misplaced stars before crosses that block required stars, then
        reasons about regions needing multiple stars. A contradiction first shows
        a general warning. Choose Show the mistake to highlight one incorrect entry,
        then Apply move to clear it. Revealed corrections and deductions count as
        hints; the initial warning does not.</p>
      <p>Target and support highlights show the reasoning. Apply move places a star
        or crosses out one cell, or clears the highlighted mistake; Undo restores
        the previous board until solved. Mistakes are checked against the unique
        solution only when you request Hint.</p>
      <h3 id="crosses" tabIndex={-1}>Crosses and auto-mark</h3>
      <p>For Queens and Star Battle, a cross marks a cell you have ruled out. The app
        checks misplaced pieces and crosses when you request Hint. Ordinary play
        does not flag a cross just because it blocks a correct cell.</p>
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
        not difficulty ratings.</p>
      <h3 id="notes" tabIndex={-1}>Controls, notes and the picker</h3>
      <p>Choose a straight, turn, note or eraser from the picker, then tap or drag across
        cells to apply it. Tapping a cell that already holds your selection clears it.
        Right-click erases a cell without changing your selection.</p>
      <ul>
        <li><strong>×</strong> means no track goes here.</li>
        <li><strong>?</strong> means a track goes here, but you have not chosen its direction.</li>
      </ul>
      <p>Each ? counts as a track towards row and column limits, but needs a direction
        before it can join the finished route. × marks do not count.</p>
      <h3>Hints</h3>
      <p>Hint or H explains a deduction from row and column counts, matching track
        connections or the two fixed edge ends. A solid outline marks the target;
        dashed outlines show support. Apply move crosses out one cell, places ?
        for definite track, or sets a forced shape. Undo restores the move until solved.</p>
      <p>The explanation may include earlier deductions. Use its location link to
        return to the target, or Escape to dismiss. Hints use your tracks, ? cells
        and crosses as assumptions; mistaken entries can mislead them. Shown hints
        count in your result even if dismissed or undone, and survive reloads.</p>
      <p>These rules do not search for a solution or reason about every possible loop
        or path. Finding no further deduction does not prove guessing is necessary.</p>
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
      <h3>Hints</h3>
      <p>Hint, or H while on the board, highlights a starting cell for a remaining word.
        Reveal next letter uncovers one more letter and its position. Solid outlines
        mark the start; dashed outlines and numbers show the continuation in order.
        Trace and submit the word yourself; hints leave your selection unchanged.</p>
      <p>Hints keep your accepted words and check that all remaining letters can still
        be used. If those words leave no completion, use Undo to try another word or path.
        A search limit is reported separately and does not prove a dead end.
        Each revealed letter counts as a hint, even after Undo, Reset or reloading.
        Dismiss or Escape closes the panel; its location link returns to the starting cell.</p>
      <p>The vocabulary is finite and does not recognize every English word.
        Newer boards use a broader acceptance list while generated answers stay familiar.
        See the <a href={`${import.meta.env.BASE_URL}word-paths-vocabulary-notice.txt`}>word list credits</a>.</p>
      <p><Link to="/preview/word-paths">Try the Word Paths preview</Link>.
        Preview progress is saved separately and does not affect daily stats.</p>

      <h2 id="trio" tabIndex={-1}>Trio</h2>
      <h3>Rules</h3>
      <ul>
        <li>Fill the 9×9 board with sun, moon and star. Each row and column needs exactly three of each.</li>
        <li>No three identical symbols may be consecutive horizontally or vertically. Diagonals are unrestricted.</li>
        <li>An = between cells requires matching symbols. An × requires different symbols; either of the other two can fit.</li>
        <li>Cells with a corner dot are givens and cannot be changed. Repeated row or column patterns are allowed.</li>
      </ul>
      <h3>Controls</h3>
      <p>Pick Sun, Moon, Star or Erase, then tap or drag across cells. Tapping a cell
        containing the selected symbol clears it. One drag is one Undo. Right-click erases.</p>
      <p>Turn on Notes to mark possible symbols in empty cells. Notes are your working
        and are not checked. Placing a symbol clears that cell&rsquo;s notes.</p>
      <p>Keys 1, 2 and 3 place sun, moon and star; Enter or Space uses the picker.
        N toggles Notes. Delete, Backspace or 0 erases. Arrow keys and Home/End move
        around the board; Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes. Reset asks for confirmation and restarts Since reset. Total time and hints are kept. Undo restores only the board.</p>
      <p>Hint explains a deduction and highlights its target with a solid outline and supporting cells with dashed outlines.
        Apply move places a forced symbol or updates one cell&rsquo;s notes to the remaining possibilities.
        Nothing changes until you apply; Undo restores the previous move. Hints ignore your notes as evidence.
        Hints actually shown count in your daily result, even if you dismiss or Undo them.</p>
      <p><Link to="/preview/trio">Play the five-board Trio preview</Link>. Attempts save
        separately in this browser. The timer pauses while the page is hidden, unfocused or closed.
        Preview solves do not affect daily stats or streaks. No difficulty rating yet.</p>

      <h2 id="sudoku" tabIndex={-1}>Sudoku</h2>
      <p><Link to="/learn/sudoku">Learn Sudoku techniques</Link> with short exercises on locked candidates, naked pairs and X-wing.</p>
      <p>Fill the 9×9 board with digits 1–9, once in every row, column and 3×3 box.
        Given numbers are fixed. Notes are optional and do not count as filled cells.</p>
      <p>Select a cell, then tap a number or press 1–9. N toggles Notes; tap digits
        to toggle their pencil marks in an empty cell. Entering a number clears that
        cell&rsquo;s notes and removes that digit from notes in its row, column and box.
        Undo restores the number and affected notes together. Erase clears the selected editable cell. Clear notes removes
        all pencil marks in one undoable move. Arrows and Home/End move around the board.</p>
      <p>Hint explains a placement or candidate elimination, with target and support
        highlights. It shows remaining candidates; Supporting deductions expands the
        earlier reasoning. Apply move is optional and undoable. Notes never prove hints.
        A wrong number first produces a free general warning; Show the mistake reveals
        one correction and counts as a hint. Undo and Reset do not refund shown hints.
        Select a filled cell to softly highlight matching numbers and their rows and columns.
        Picker digits dim once nine are placed, including givens. They remain usable;
        this count does not confirm that the placements are correct.</p>
      <p>Drag over cells, Shift-click or use Shift with the arrow keys to select several
        cells. Digits update notes in the empty selected cells even with Notes off;
        filled cells stay unchanged. A digit is added wherever missing, or removed
        when every empty selected cell already has it. Erase clears their notes.
        Each group edit takes one Undo. Select one cell to return to normal entry.</p>
      <p>Choose a daily Easy, Medium or Hard puzzle. Each has
        one independently verified solution and finishes through its supported logical
        techniques. Medium requires more than singles; Hard requires more than our
        Medium techniques. These are provisional project ratings. <Link to="/preview/sudoku">Practice boards</Link> remain available;
        their attempts save separately and do not affect daily stats, streaks or leaderboards.</p>

      <h2 id="nurikabe" tabIndex={-1}>Nurikabe</h2>
      <h3>Rules</h3>
      <ul>
        <li>Shade cells to form one connected sea. Connections run up, down, left and right.</li>
        <li>Each unshaded island contains exactly one number, and its area equals that number.</li>
        <li>Islands cannot touch along an edge. Diagonal contact is allowed.</li>
        <li>The sea cannot contain a solid 2×2 square.</li>
        <li>Numbered cells are fixed land. Land dots are optional; unshaded cells form the islands when the puzzle is complete.</li>
      </ul>
      <h3>Controls</h3>
      <p>Pick Sea, Land or Erase, then tap or drag. Tap again to clear the same mark.
        One drag is one Undo. Right-click erases. Arrows and Home/End move between cells.
        Keys 1 or S shade sea; 2 or L marks land; 0, Delete or Backspace erases.
        Enter or Space uses the picker. The shared Undo, Redo and confirmed Reset controls apply.</p>
      <p><Link to="/preview/nurikabe">Try the three-board Nurikabe preview</Link>.
        Attempts save separately in this browser. Preview solves do not affect daily stats,
        streaks or leaderboards. Hints are not available yet.</p>

      <h2>Finishing, sharing and stats</h2>
      <p>A solved board locks and offers a result to share, optionally including the finished
        board as a spoiler. Your first solve of each puzzle is recorded; replaying it does
        not overwrite that time. Each Train Tracks size and Sudoku level counts as its own puzzle.</p>
      <p>Stats stay in this browser. Clearing site data removes
        them. A streak counts each day once, however many puzzles you solve.</p>
      <p><Link to="/leaderboards">Leaderboards</Link> are optional. Joining publishes your
        nickname, exact puzzle, time and hints to Supabase for this and future first solves.
        Earlier history and previews are not uploaded. Supabase keeps an anonymous player
        identity; Cloudflare verifies joining. You can stop publishing or remove your own
        published results there. Clearing browser data loses that identity and access to its
        results; identities do not sync between devices. Scores are community-reported.</p>

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
