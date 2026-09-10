"use client";

/**
 * A text field with optional one-tap answers under it. Standing in a
 * pizzeria, the style is nearly always one of three words — but the field
 * still takes anything.
 */
export function ChipField({
  label,
  placeholder,
  value,
  options = [],
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options?: string[];
  onChange: (value: string) => void;
}) {
  const chosen = value.trim().toLowerCase();

  return (
    <div>
      <label className="plate block px-4 py-3">
        <span className="label">{label}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full bg-transparent text-base outline-none placeholder:text-muted"
        />
      </label>

      {options.length > 0 && (
      <div className="mt-2 grid grid-cols-3 gap-2">
        {options.map((suggestion) => {
          const active = chosen === suggestion.toLowerCase();
          return (
            <button
              key={suggestion}
              type="button"
              aria-pressed={active}
              // Tapping the one already chosen clears it, so a mistap costs
              // nothing.
              onClick={() => onChange(active ? "" : suggestion)}
              className={`truncate border px-2 py-2.5 text-[0.625rem] tracking-[0.12em] transition-colors ${
                active ? "border-ink bg-ink text-paper" : "border-rule text-ink"
              }`}
            >
              {suggestion.toUpperCase()}
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
