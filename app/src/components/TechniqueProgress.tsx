import { techniqueProgress } from '../lib/learningAchievements'

export function TechniqueProgress({ exercises, completed }: {
  exercises: readonly { readonly id: string }[]
  completed: readonly string[]
}) {
  const progress = techniqueProgress(exercises, completed)
  return <p className="lesson-progress">{progress.completed} of {progress.total} completed
    {progress.practiced && <> · <span className="technique-practiced"><span aria-hidden="true">✦ </span>Technique practiced</span></>}
  </p>
}

export function TechniqueCelebration({ title }: { title: string }) {
  return <span className="technique-celebration"> <span aria-hidden="true">✦ </span>{title} practiced!</span>
}
