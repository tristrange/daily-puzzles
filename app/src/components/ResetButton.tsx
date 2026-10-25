export function ResetButton({ disabled, onReset }: { disabled: boolean; onReset: () => void }) {
  return <button type="button" className="tool-button" disabled={disabled}
    title="Reset asks for confirmation and restarts the latest-attempt timer. Total time and hints are kept. Undo restores only the board."
    onClick={() => {
      if (window.confirm('Reset this puzzle? Your moves will be cleared. The since-reset timer restarts. Total time and hints are kept. Undo restores only the board.')) onReset()
    }}>Reset</button>
}
