/** Frozen v2 and v3 acceptance; generated answers stay in the familiar pools. */
import v2Source from '@shared/engine/src/queens_engine/data/word-paths-en-v2.txt?raw'
import v3Source from '@shared/engine/src/queens_engine/data/word-paths-en-v3.txt?raw'

const load = (source: string): readonly string[] => Object.freeze(
  source.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#')).sort(),
)

export const WORD_PATHS_V2_VOCABULARY: readonly string[] = load(v2Source)
export const WORD_PATHS_V3_VOCABULARY: readonly string[] = load(v3Source)
