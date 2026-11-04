"use client";

import { noteLength, RECIPE_NOTE_MAX_LENGTH } from "@bartendingapp/shared";

interface NoteFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
}

/** A style sentence or tip textarea with a live n/240 counter (spec 0043 AC-10). */
export function NoteField({ id, label, value, onChange, error }: NoteFieldProps) {
  const length = noteLength(value.trim());
  const counterId = `${id}-counter`;

  return (
    <div className="flex flex-col gap-one">
      <label htmlFor={id} className="text-label font-medium text-text">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        aria-describedby={counterId}
        aria-invalid={error ? true : undefined}
        className={`rounded-small border bg-surface px-three py-two text-body text-text ${
          error ? "border-danger" : "border-border"
        }`}
      />
      <span
        id={counterId}
        className={`self-end text-body-small ${
          length > RECIPE_NOTE_MAX_LENGTH ? "text-danger" : "text-text-muted"
        }`}
      >
        {length}/{RECIPE_NOTE_MAX_LENGTH}
      </span>
      {error && (
        <span role="alert" className="text-body-small text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
