interface ConvictionStarsProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function ConvictionStars({ value, onChange }: ConvictionStarsProps) {
  return (
    <div role="radiogroup" aria-label="확신도">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(value === n ? null : n)}
        >
          {value != null && n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}
