import { useId, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, id, className = "", ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-one">
      <label htmlFor={inputId} className="text-label font-medium text-text">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`rounded-small border bg-surface px-three py-two text-body text-text placeholder:text-text-muted ${
          error ? "border-danger" : "border-border"
        } ${className}`}
        {...rest}
      />
      {error && (
        <span id={errorId} role="alert" className="text-body-small text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
