import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Rendered inside the field's right edge, e.g. a show password toggle. */
  trailing?: ReactNode;
}

export function Input({ label, error, trailing, id, className = "", ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-one">
      <label htmlFor={inputId} className="text-label font-medium text-text">
        {label}
      </label>
      <div className="relative flex">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={`w-full rounded-small border bg-surface py-two text-body text-text placeholder:text-text-muted ${
            error ? "border-danger" : "border-border"
          } ${trailing ? "pl-three pr-five" : "px-three"} ${className}`}
          {...rest}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-one">{trailing}</div>
        )}
      </div>
      {error && (
        <span id={errorId} role="alert" className="text-body-small text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
