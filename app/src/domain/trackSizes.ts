/** The same named boards and activation day the publisher reads. */
import { trainTracks } from '../../../conformance/id-cases/manifest.json'

export type TrackSize = 'small' | 'medium' | 'large'
export type TrackVariant = {
  readonly name: TrackSize
  readonly suffix: string
  readonly side: number
  readonly label: string
}

export const TRACK_SIZES_START = trainTracks.activationDay
export const TRACK_SIZES_ARCHIVE_START = trainTracks.archiveStart
export const TRACK_LEGACY_END = trainTracks.legacyUntil
export const TRACK_VARIANTS = trainTracks.variants as readonly TrackVariant[]

/** Classify the suffix; calendar validation remains in the ID parser. */
export function trackVariantOf(id: string): TrackVariant | null {
  return TRACK_VARIANTS.find((variant) => id.endsWith(variant.suffix)) ?? null
}
