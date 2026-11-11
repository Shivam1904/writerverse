/* The 4-step stepper — Identity · Arc · Outline · Voice.
 * Highlights the step the scroll position is in (`current`); clicking a step
 * scrolls to + expands that section (handled by the page via `onJump`). */

export interface StudioStep {
  id: string;
  label: string;
  status: string;
  done: boolean;
}

export function StudioStepper({
  steps, current, onJump,
}: {
  steps: StudioStep[];
  current: string;
  onJump: (id: string) => void;
}) {
  return (
    <div className="cst-stepper">
      {steps.map((s, i) => {
        const on = current === s.id;
        return (
          <button
            key={s.id}
            type="button"
            className={`cst-step${on ? ' is-on' : ''}${s.done ? ' is-done' : ''}`}
            onClick={() => onJump(s.id)}
          >
            <span className="cst-step-num">{s.done ? '✓' : i + 1}</span>
            <span className="cst-step-text">
              <span className="cst-step-lbl">{s.label}</span>
              <span className="cst-step-status">{s.status}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
