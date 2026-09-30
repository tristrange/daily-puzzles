import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section>
      <h2 className="page-title">Nothing here</h2>
      <p className="status">
        <Link to="/">Head back to today&rsquo;s puzzle</Link>
        .
      </p>
    </section>
  )
}