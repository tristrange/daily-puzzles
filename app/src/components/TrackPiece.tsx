/** Railway rails and sleepers for each of the six track orientations. */
const PIECES = [
  null,
  { centre: 'M0 50 H100', rails: 'M0 35 H100 M0 65 H100' },
  { centre: 'M50 0 V100', rails: 'M35 0 V100 M65 0 V100' },
  { centre: 'M50 0 Q50 50 100 50', rails: 'M35 0 Q35 65 100 65 M65 0 Q65 35 100 35' },
  { centre: 'M100 50 Q50 50 50 100', rails: 'M100 35 Q35 35 35 100 M100 65 Q65 65 65 100' },
  { centre: 'M50 100 Q50 50 0 50', rails: 'M65 100 Q65 35 0 35 M35 100 Q35 65 0 65' },
  { centre: 'M0 50 Q50 50 50 0', rails: 'M0 65 Q65 65 65 0 M0 35 Q35 35 35 0' },
] as const

export function TrackPiece({ piece }: { piece: number }) {
  const track = PIECES[piece]
  if (!track) return null
  return <svg className="track-piece" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path className="track-sleepers" d={track.centre} />
    <path className="track-rails" d={track.rails} />
  </svg>
}
