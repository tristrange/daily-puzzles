/**
 * One track piece, drawn as arms from the centre of its cell to the edges it
 * ends in.
 *
 * Not a glyph. A font character cannot be made to reach the cell's edges
 * reliably — its width depends on the font, the platform and the size, and at
 * any size that leaves room for the stroke there is a visible gap between two
 * cells whose pieces do meet. That gap is the whole puzzle: reciprocity is the
 * rule, and a line that does not *look* connected is a line the player has to
 * reason about instead of see.
 *
 * So the arms are drawn. Two of them, from the centre to the two edges, and the
 * edges they reach are the cell's own edges — which means two adjacent pieces
 * that are joined meet exactly, whatever the font is doing.
 *
 * The glyphs in `PIECE_GLYPHS` are still used, for the text share, where a
 * monospaced grid is the medium and a glyph is the right answer.
 */

import { PIECE_ENDS } from '../domain/tracks'

/** Compass names, in the order `PIECE_ENDS` lists them. */
const DIRECTION_NAME = ['n', 'e', 's', 'w'] as const

export function TrackPiece({ piece }: { piece: number }) {
  const ends = PIECE_ENDS[piece] ?? []
  return (
    <span className="track-piece" aria-hidden="true">
      {ends.map((end) => (
        <i key={DIRECTION_NAME[end]} className={`track-arm ${DIRECTION_NAME[end] ?? 'n'}`} />
      ))}
    </span>
  )
}