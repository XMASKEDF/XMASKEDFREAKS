"use client";

type SlitherJoystickProps = {
  onBoost: (boosting: boolean) => void;
  onPause: () => void;
  paused: boolean;
};

export default function SlitherJoystick({ onBoost, onPause, paused }: SlitherJoystickProps) {
  return (
    <div className="slither-mobile-controls">
      <button
        className="secondary"
        type="button"
        onPointerDown={() => onBoost(true)}
        onPointerUp={() => onBoost(false)}
        onPointerCancel={() => onBoost(false)}
      >
        Boost
      </button>
      <button className="secondary" type="button" onClick={onPause}>{paused ? "Resume" : "Pause"}</button>
    </div>
  );
}
