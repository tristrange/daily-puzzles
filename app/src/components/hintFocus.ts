export function focusHintPanel(node: HTMLElement | null) {
  if (!node) return
  node.focus({ preventScroll: true })
  const rect = node.getBoundingClientRect()
  if (rect.top < 0 || rect.bottom > window.innerHeight) node.scrollIntoView({ block: 'nearest' })
}
