import { Cross2Icon, MagnifyingGlassIcon } from '@radix-ui/react-icons';

interface ApplicantSearchFieldProps {
  className?: string;
  inputClassName?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

// Shared by the review queue and the Decisions page so both behave identically.
// Styling arrives through className, because one page is Tailwind and the other is CSS classes.
export function ApplicantSearchField({
  className = '',
  inputClassName = '',
  onChange,
  placeholder = 'Search by name',
  value,
}: ApplicantSearchFieldProps) {
  return (
    <div role="search" className={`relative ${className}`}>
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
      />
      <input
        type="search"
        value={value}
        aria-label="Search applicants by name or email"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            // Stop the key here so it does not also close a surrounding dialog.
            event.stopPropagation();
            onChange('');
          }
        }}
        className={`w-full min-w-0 pl-9 ${value ? 'pr-9' : 'pr-3'} ${inputClassName}`}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <Cross2Icon aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
