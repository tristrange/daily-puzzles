/** Frozen v2 acceptance; generated answers remain in the familiar v1 pool. */
import vocabularySource from '@shared/engine/src/queens_engine/data/word-paths-en-v2.txt?raw'

export const WORD_PATHS_V2_VOCABULARY: readonly string[] = Object.freeze(
  vocabularySource.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#')).sort(),
)
