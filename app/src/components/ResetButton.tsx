export function ResetButton({ disabled, onReset }: { disabled: boolean; onReset: () => void }) {
  return <button type="button" className="tool-button" disabled={disabled}
    title="Reset asks for confirmation. The clock keeps running, and Undo can restore the board."
    onClick={() => {
      if (window.confirm('Reset this puzzle? Your moves will be cleared. The timer keeps running, and you can Undo the reset.')) onReset()
    }}>Reset</button>
}
