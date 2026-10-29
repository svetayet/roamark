/** Знак приложения: изумрудная плитка с горей и тропой, рядом «roaMark» с мятной M. */
export function Brand() {
  return (
    <span className="home__brand">
      <svg
        width="32"
        height="32"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        className="home__brand-tile"
      >
        <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="#0f6b51" />
        <path
          d="M7 29 L14 18.5 L18 23.5 L23.5 15 L33 29"
          stroke="#ffffff"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M23.5 15 V10.5" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M23.5 10.5 l5 1.6 -5 1.6 Z" fill="#7fc8a6" />
        <path
          d="M10.5 27.5 C 13 26.7, 12 23.5, 15 23"
          stroke="#7fc8a6"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeDasharray="0.4 3.4"
        />
      </svg>
      <span className="home__brand-word">
        roa<span className="home__brand-m">M</span>ark
      </span>
    </span>
  );
}
