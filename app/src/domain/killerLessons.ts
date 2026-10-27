import raw from '../data/killer-sudoku-previews.json'
import { parseKillerPreviews } from './killerSudoku'

const boards = parseKillerPreviews(raw)

/** The given digits in the named unit exclude the indicated cage combinations. */
export const KILLER_LESSONS = [
  { id: 'cage-combinations', board: boards[0]!, cageIndex: 0, forbidden: [5], support: [36],
    prompt: 'This cage lies entirely in column 1. Use the placed digits in that column to cross out combinations that cannot fit.',
    cue: 'Column 1 already has a 5 outside the cage.',
    explanation: 'The cage needs two distinct digits totaling 13: 4 + 9, 5 + 8 or 6 + 7. The 5 already in column 1 rules out 5 + 8. The other combinations are not ruled out by this clue.' },
  { id: 'cage-combinations-2', board: boards[2]!, cageIndex: 25, forbidden: [5], support: [54],
    prompt: 'This four-cell cage lies entirely in the bottom-left box. Cross out combinations that cannot fit in that box.',
    cue: 'Look for a digit already placed in the same box.',
    explanation: 'Four distinct digits totaling 12 are either 1 + 2 + 3 + 6 or 1 + 2 + 4 + 5. The box already contains 5, so cross out the second combination.' },
  { id: 'cage-combinations-3', board: boards[1]!, cageIndex: 6, forbidden: [2, 3], support: [7, 17],
    prompt: 'This three-cell cage lies entirely in the top-right box. Cross out every combination excluded by the placed digits in that box.',
    cue: 'Two different digits in that box cannot also appear in the cage.',
    explanation: 'The box already contains 2 and 3. Since all three cage cells are in that box, no cage combination can include either digit. The three remaining sets all total 16.' },
] as const
