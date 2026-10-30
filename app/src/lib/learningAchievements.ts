type Exercise = { readonly id: string }

export function techniqueProgress(exercises: readonly Exercise[], completed: readonly string[]) {
  const known = new Set(completed)
  const count = exercises.filter(exercise => known.has(exercise.id)).length
  return { completed: count, total: exercises.length, practiced: exercises.length > 0 && count === exercises.length }
}

/** True only for the correct answer that completes a previously unfinished technique. */
export function finishesTechnique(exercises: readonly Exercise[], completed: readonly string[], checkedId: string): boolean {
  return !completed.includes(checkedId) && exercises.some(exercise => exercise.id === checkedId)
    && techniqueProgress(exercises, [...completed, checkedId]).practiced
}
