import type { Category } from '../data/types';

/** Линейные иконки активностей; stroke наследует currentColor. */
export function ActivityIcon({ category }: { category: Category }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[category]}
    </svg>
  );
}

const PATHS: Record<Category, React.ReactNode> = {
  hike: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v6l-3 7M12 13l3 3 1 4M12 9l-4 2.5M12 9l4.5 3M18 7v14" />
    </>
  ),
  bike: (
    <>
      <circle cx="6" cy="17" r="3.5" />
      <circle cx="18" cy="17" r="3.5" />
      <path d="M6 17l4-8h5l3 8M10 9h-2M14 6h4" />
    </>
  ),
  run: (
    <>
      <circle cx="14" cy="4.5" r="2" />
      <path d="M14 7l-2.5 4.5 3.5 3.5.5 5M11.5 11.5l-4.5 1M13.5 9l4.5 3M16 20l-3.5-2" />
    </>
  ),
  ski: (
    <>
      <circle cx="13" cy="4.5" r="2" />
      <path d="M13 7l-2 7 4 4M11 14l-5 3M15 18l4-2M13 7l4 1M2 21h16M7 18l-5 3" />
    </>
  ),
};
