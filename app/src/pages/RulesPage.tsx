import { Link } from 'react-router-dom'

/**
 * How to play, for both games.
 *
 * Written from the rules the engine enforces rather than from the genre's
 * conventions, because this app's Queens is not the same puzzle as the puzzle
 * most people meet under that name: every region holds exactly one piece, and no
 * two pieces touch, not even diagonally. A player arriving from elsewhere will
 * lose to that second rule unless it is written down here, and a tutorial that
 * only described the well-known version would be confidently wrong.
 */
export function RulesPage() {
  return (
    <section className="rules">
      <h2 className="page-title">How to play</h2>
      <p className="status">
        Two puzzles are published every day, one of each game. They share a board, a set of
        moves and a win condition &mdash; they differ only in how many pieces a row and a
        region hold. Every day so far is kept in the <Link to="/archive">archive</Link>.
      </p>

      <h3>The board</h3>
      <p>
        The daily board is 8&times;8. Cells that share a background colour form a{' '}
        <strong>region</strong>. You fill cells with pieces; the pieces you place have to
        satisfy every rule below at once, and the board lights up when they do.
      </p>
      <p>
        A region holding more than one piece prints that number in its top-left cell. In
        Queens every region holds exactly one, so nothing is printed &mdash; the number is
        always one and drawing it 64 times would only be noise.
      </p>

      <h3>Rules both games share</h3>
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

      <h3>Queens</h3>
      <p>
        Place one queen in each row, in each column and in each region, with no two queens
        touching, not even at a corner. Crosses are yours to place as notes; see{' '}
        <a href="#crosses">Crosses and auto-mark</a>.
      </p>

      <h3>Star Battle</h3>
      <p>
        Place stars so that each region holds exactly the number printed in it, so that every
        row and every column holds the same number of stars, and so that no two stars touch,
        not even at a corner. On the daily board each region holds two, which puts two stars
        in each of the eight rows and columns.
      </p>
      <p>
        Star Battle ships without hints. The hint engine is a Queens port, and a board played
        with a hint that does not apply is worse than no hint at all, so the button is not
        offered rather than offered and wrong.
      </p>

      <h3 id="crosses">Crosses and auto-mark</h3>
      <p>
        A cross marks a cell you have ruled out. The app never checks them: they are your
        working notes, and a cross on a cell that should hold a piece is simply a mistake you
        can undo.
      </p>
      <p>
        <strong>Auto-mark</strong> is off by default. Switched on, placing a piece also crosses
        off the cells that piece rules out &mdash; in Queens the rest of its row, its column and
        its region plus the cells touching it; in Star Battle only the cells touching it. It
        draws conclusions you may not have made yet, so leaving it off keeps the board showing
        only what you have worked out yourself.
      </p>

      <h3>Controls</h3>
      <p>A left click cycles a cell through empty, cross, piece, empty.</p>
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
            <td>Cycles it: empty &rarr; cross &rarr; piece &rarr; empty.</td>
          </tr>
          <tr>
            <th scope="row">Drag across cells</th>
            <td>
              Applies one action to every cell you cross. Starting on a cross erases the crosses
              instead of adding them.
            </td>
          </tr>
          <tr>
            <th scope="row">Right-click a cell</th>
            <td>Toggles a cross.</td>
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
            <td>Toggle a cross.</td>
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
        keys move within it. Each cell announces its row, column and contents, and says how
        many pieces its region needs and whether the piece standing there conflicts.
      </p>

      <h3>Hints</h3>
      <p>
        In Queens, <strong>H</strong> or the <strong>Hint</strong> button names a cell and says
        whether to place a queen there or cross it off. A hint is only given once the board has
        no conflicts to clean up first, and only when the position actually forces a move &mdash;
        otherwise it says so rather than guessing. Hints you were actually shown are counted in
        your result, so a solve without them shares differently.
      </p>

      <h3>Finishing and sharing</h3>
      <p>
        When the board is solved it locks and offers two share texts: the result, and the same
        text with the finished board included, which gives the puzzle away. Only your first
        solve of a day is recorded &mdash; coming back to a board you have already solved tells
        you the time you first set, rather than overwriting it.
      </p>

      <h3>Your stats</h3>
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
