import { useState } from 'react';

// Auto-detect the brand logo. The user swaps the file by simply replacing
// one of these in `public/logo/` — no code change required. We try each
// supported format in priority order; the first that loads wins.
const CANDIDATES = [
  '/logo/logo.png',
  '/logo/logo.jpg',
  '/logo/logo.jpeg',
  '/logo/logo.webp',
  '/logo/logo.svg',
];

export default function BrandLogo({ className = '', alt = 'Brand Logo', maxWidth = 220, maxHeight = 80 }) {
  const [srcIndex, setSrcIndex] = useState(0);

  if (srcIndex >= CANDIDATES.length) return null;

  const src = CANDIDATES[srcIndex];

  return (
    <img
      className={`brand-logo ${className}`}
      src={src}
      alt={alt}
      style={{ maxWidth, maxHeight }}
      onError={() => setSrcIndex((i) => i + 1)}
      draggable={false}
    />
  );
}
