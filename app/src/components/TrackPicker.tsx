/**
 * The strip of things a click can put in a cell.
 *
 * It replaced a click that cycled through seven states, which was honest to the
 * model — the piece *is* the orientation, so there is no separate rotate step —
 * and unusable in practice, because laying twenty pieces one that meant several
 * clicks each is most of the work of solving a board that has already been solved
 * in your head. A picker turns "advance one step" into "put this one", which is
 * the same gesture either way and arrives at the same cell.
 *
 * One row, above the board. Not one above and one below: the board is as tall as
 * the viewport on a phone, so whichever copy sat below it would scroll off at
 * exactly the moment it was wanted, and the copy above is the one you reach for
 * while reading the board.
 *
 * Real radio inputs rather than buttons with `aria-pressed`. A single-select set
 * that is not a radio group is a set the screen reader will not announce as one,
 * and that gives every entry its own tab stop where the group is meant to be one.
 * The inputs are visually hidden and the face beside each is the button, which is
 * the standard pairing and needs no script for its keyboard behaviour.
 */

import { TRACK_BRUSHES, TRACK_CELL_NAME, type TrackBrush } from '../domain/tracksGame'
import { TrackPiece } from './TrackPiece'

/** What the picker draws for each entry, in `TRACK_BRUSHES` order. */
function face(brush: TrackBrush): { glyph: string; label: string } {
  if (brush === 0) return { glyph: '⌫', label: 'eraser' }
  if (brush > 6) return { glyph: brush === 7 ? '×' : '?', label: TRACK_CELL_NAME[brush] ?? '' }
  return { glyph: '', label: TRACK_CELL_NAME[brush] ?? '' }
}

const title = (label: string): string => label[0]?.toUpperCase() + label.slice(1)

export function TrackPicker({
  brush,
  disabled = false,
  onPick,
}: {
  brush: TrackBrush
  disabled?: boolean
  onPick: (brush: TrackBrush) => void
}) {
  return (
    <div className="track-picker" role="radiogroup" aria-label="What to put in a cell">
      {TRACK_BRUSHES.map((entry) => {
        const { glyph, label } = face(entry)
        return (
          <label key={entry} className={`track-pick track-pick-${entry}`} title={title(label)}>
            <input
              className="sr-only"
              type="radio"
              name="track-brush"
              checked={brush === entry}
              disabled={disabled}
              onChange={() => onPick(entry)}
              aria-label={title(label)}
            />
            <span className="track-pick-face">
              {glyph !== '' ? <span className="track-pick-glyph">{glyph}</span> : <TrackPiece piece={entry} />}
            </span>
          </label>
        )
      })}
    </div>
  )
}