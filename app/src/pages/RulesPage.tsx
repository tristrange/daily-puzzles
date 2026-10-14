import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

/**
 * How to play, for all three games.
 *
 * Written from the rules the engine enforces rather than from the genre's
 * conventions, because this app's Queens is not the same puzzle as the puzzle
 * most people meet under that name: every region holds exactly one piece, and no
 * two pieces touch, not even diagonally. A player arriving from elsewhere will
 * lose to that second rule unless it is written down here, and a tutorial that
 * only described the well-known version would be confidently wrong.
 */
export function RulesPage() {
  // The app routes on the URL fragment, so `#crosses` is a *route* here, not an
  // anchor: a plain `href="#crosses"` replaces `/how-to-play` with it and the
  // router renders the not-found page. Links carry the section as the router's
  // hash instead, which leaves the route intact -- and the browser will not do
  // the scrolling for us, because its fragment is now `/how-to-play#crosses`
  // rather than `crosses`. So it is done here, which also makes a shared or
  // reloaded link land on the section it names.
  const { hash } = useLocation()

  useEffect(() => {
    const id = hash.replace(/^#/, '')
    if (id !== '') document.getElementById(id)?.scrollIntoView()
  }, [hash])

  return (
    <section className="rules">
      <h1 className="page-title">How to play</h1>
      <p className="status">
        Fresh Queens, Star Battle and Train Tracks puzzles arrive every day, with
        three Train Tracks sizes to choose from. Word Paths joins the daily lineup
        on October 15. Published puzzles are kept in the <Link to="/archive">archive</Link>.
      </p>

      <h2>The board</h2>
      <p>
        The daily board varies in size from 7&times;7 to 9&times;9, depending on the day and
        the game. Cells that share a background colour form a{' '}
        <strong>region</strong>. You fill cells with pieces; the pieces you place have to
        satisfy every rule below at once, and the board lights up when they do.
      </p>
      <p>
        A region holding more than one piece prints that number in its top-left cell. In
        Queens every region holds exactly one, so nothing is printed &mdash; the number is
        always one and drawing it in every top-left cell would only be noise.
      </p>

      <h2>Rules both games share</h2>
      <ul>
        <li>
          <strong>Regions are filled exactly.</strong> Every region ends up holding precisely
          the number of pieces it calls for, no more and no fewer.
        </li>
        <li>
          <strong>No two pieces touch.</strong> Not side by side, not above and below, and not
          diagonally. A piece rules out all eight cells around it.
        </li>
        <li>
          <strong>Rows and columns are even.</strong> Every row and every column ends up with
          the same number of pieces, which is one for Queens.
        </li>
      </ul>

      <h2>Queens</h2>
      <p>
        Place one queen in each row, in each column and in each region, with no two queens
        touching, not even at a corner. Crosses are yours to place as notes; see{' '}
        <Link to={{ pathname: '/how-to-play', hash: '#crosses' }}>Crosses and auto-mark</Link>.
      </p>

      <h2>Star Battle</h2>
      <p>
        Place stars so that each region holds exactly the number printed in it, so that every
        row and every column holds the same number of stars, and so that no two stars touch,
        not even at a corner. On the daily board each region holds two, which puts two stars
        in every row and column.
      </p>
      <p>
        Both games offer hints, and both are computed here on the board as it stands rather
        than looked up: a hint can explain <em>why</em> a cell is forced instead of just
        revealing it. Star Battle needs a rule the other game does not — a region with two
        cells left and two stars still to place is full, so both are stars — and the hint
        engine applies it.
      </p>

      <h2>Train Tracks</h2>
      <p>
        Join every cell into <strong>one unbroken line</strong>. Each cell holds one of six
        pieces &mdash; two straights and four turns &mdash; and a piece's arms say which of the
        four sides it reaches out to.
      </p>
      <ul>
        <li>
          <strong>An arm must be met.</strong> If a piece points at a neighbouring cell, that
          cell must point back. This is the rule the whole game rests on, and it is why two
          side-by-side cells do not have to be joined: the pieces themselves decide.
        </li>
        <li>
          <strong>It is one line, not several.</strong> Every piece belongs to the same path,
          and a closed loop is not allowed.
        </li>
        <li>
          <strong>Both ends leave the board.</strong> The two open ends run off the grid
          rather than stopping at a cell.
        </li>
        <li>
          <strong>Rows and columns are counted.</strong> The numbers beside the board say how
          many cells the line occupies in each row and column. They are the clue, and they
          must come out exactly.
        </li>
      </ul>
      <p>
        The pieces already on the board are <strong>givens</strong> and cannot be moved; they
        are drawn on a sunken cell so you can tell them from your own. They always include the
        two ends of the line, which is what fixes where the line starts and finishes before you
        place anything.
      </p>
      <p>
        Train Tracks has <strong>no hints and no difficulty band</strong> &mdash; there is no
        hint engine for it yet, so rather than offer hints that might contradict the answer it
        offers none.
      </p>

      <h2 id="notes">Notes, and the picker</h2>
      <p>
        A cell can hold a piece, or one of two notes, or nothing:
      </p>
      <ul>
        <li>
          <strong>&times;</strong> &mdash; no track goes here. Your own reasoning; the app
          never checks it.
        </li>
        <li>
          <strong>?</strong> &mdash; a track <em>does</em> go here, you just have not settled
          which way it turns. A row clue that is nearly spent fixes that long before it fixes
          the direction, and this is how you write that down.
        </li>
      </ul>
      <p>
        The row of buttons above the board is the <strong>picker</strong>. Pick what you want
        and then click: each cell takes whatever is picked. Clicking a cell that already holds
        it clears it, so a misjudged click is undone by clicking the same thing again. The
        last entry is the eraser, which clears a cell whatever is in it.
      </p>
      <p>
        <strong>Right-click</strong> &mdash; or a two-finger click on a trackpad &mdash;
        erases the cell outright, without changing what the picker is set to.
        <strong>Click and drag</strong> applies whatever is picked to every cell you cross, so
        a run of exclusions is one stroke. A whole stroke is one Undo, however many cells it
        covered.
      </p>
      <p>
        From the keyboard: <strong>1</strong> to <strong>6</strong> put that track in the
        focused cell without going near the picker, <strong>x</strong> marks it out,
        <strong>?</strong> marks it undecided, <strong>Delete</strong> clears it, and
        <strong>Enter</strong> puts the picked entry in it.
      </p>

      <h2 id="crosses">Crosses and auto-mark</h2>
      <p>
        A cross marks a cell you have ruled out. The app never checks them: they are your
        working notes, and a cross on a cell that should hold a piece is simply a mistake you
        can undo.
      </p>
      <p>
        <strong>Auto-mark</strong> starts off, and the page remembers your choice for next
        time. Switched on, placing a piece also crosses
        off the cells that piece rules out &mdash; in Queens the rest of its row, its column and
        its region plus the cells touching it; in Star Battle only the cells touching it. It
        draws conclusions you may not have made yet, so leaving it off keeps the board showing
        only what you have worked out yourself.
      </p>

      <h2>Controls</h2>
      <p>
        A left click cycles a cell through its states: empty, cross, piece, empty for the two
        marks games; and for Train Tracks, empty and then each of the six pieces in turn,
        because the piece <em>is</em> the direction it runs.
      </p>
      <table className="controls">
        <thead>
          <tr>
            <th scope="col">Input</th>
            <th scope="col">Does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Click a cell</th>
            <td>
              Cycles it: empty &rarr; cross &rarr; piece &rarr; empty. On Train Tracks, puts
              whatever the picker is set to.
            </td>
          </tr>
          <tr>
            <th scope="row">Drag across cells</th>
            <td>
              Applies one action to every cell you cross. On the marks games, starting on a
              cross erases the crosses instead of adding them; on Train Tracks the stroke
              applies the picker to every cell it crosses.
            </td>
          </tr>
          <tr>
            <th scope="row">Right-click a cell</th>
            <td>
              Toggles a cross on the marks games; erases the cell on Train Tracks. Also a
              two-finger click on a trackpad.
            </td>
          </tr>
          <tr>
            <th scope="row">Arrow keys</th>
            <td>Move between cells.</td>
          </tr>
          <tr>
            <th scope="row">Home / End</th>
            <td>Jump to the start or end of the row.</td>
          </tr>
          <tr>
            <th scope="row">Enter or Space</th>
            <td>Place or remove the piece in the focused cell.</td>
          </tr>
          <tr>
            <th scope="row">X</th>
            <td>Toggle a cross. Marks games only.</td>
          </tr>
          <tr>
            <th scope="row">1 to 6</th>
            <td>
              Put that track straight into the focused cell, without going to the picker. Train
              Tracks only.
            </td>
          </tr>
          <tr>
            <th scope="row">?</th>
            <td>Mark the cell undecided. Train Tracks only.</td>
          </tr>
          <tr>
            <th scope="row">Delete or Backspace</th>
            <td>Clear the cell.</td>
          </tr>
          <tr>
            <th scope="row">H</th>
            <td>Ask for a hint (Queens only).</td>
          </tr>
          <tr>
            <th scope="row">Ctrl / Cmd + Z</th>
            <td>Undo. A whole drag counts as one move.</td>
          </tr>
        </tbody>
      </table>
      <p>
        The board is a single tab stop: one cell is in the tab order at a time and the arrow
        keys move within it. On the marks games each cell announces its row, column and
        contents, and says how many pieces its region needs and whether the piece standing
        there conflicts. On Train Tracks it says what the piece is, what its row and column
        need, and what is wrong with it if anything is.
      </p>

      <h2>Word Paths</h2>
      <p>Find words by tracing adjoining letters up, down, left or right. Use every
        letter once, with one word of each shown length. Blocked cells and letters
        already used by a word cannot be selected. Drag and release to submit, or
        tap letters and use Submit. Space selects a focused letter; Enter submits.
        Backspace removes the last letter, Escape clears selection, and Undo removes
        the last accepted word. Accepted words can lead to dead ends. The game uses
        a finite English word list; it does not recognize every English word.</p>
      <p><Link to="/preview/word-paths">Try the Word Paths preview</Link>. Preview
        progress is saved separately and does not affect daily stats.</p>

      <h2>Hints</h2>
      <p>
        In Queens, <strong>H</strong> or the <strong>Hint</strong> button names a cell and says
        whether to place a queen there or cross it off. A hint is only given once the board has
        no conflicts to clean up first, and only when the position actually forces a move &mdash;
        otherwise it says so rather than guessing. Hints you were actually shown are counted in
        your result, so a solve without them shares differently.
      </p>

      <h2>Finishing and sharing</h2>
      <p>
        When the board is solved it locks and offers two share texts: the result, and the same
        text with the finished board included, which gives the puzzle away. Only your first
        solve of a day is recorded &mdash; coming back to a board you have already solved tells
        you the time you first set, rather than overwriting it.
      </p>

      <h2>Your stats</h2>
      <p>
        Solves are kept in this browser only. There is no account and nothing is uploaded, so
        clearing your browser data clears them with it. A streak counts a day once, whether you
        solved one puzzle that day or both.
      </p>

      <p className="status">
        Ready? <Link to="/">Pick today&rsquo;s puzzles</Link>.
      </p>
    </section>
  )
}
