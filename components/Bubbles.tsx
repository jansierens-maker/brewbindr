import React, { useEffect, useRef } from 'react';

export function Bubbles() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!containerRef.current) return;

      const b = document.createElement('div');
      b.className = 'bbl';
      const size = 4 + Math.random() * 10;
      const left = Math.random() * 100;
      const duration = 3 + Math.random() * 4;
      const delay = Math.random() * 2;

      b.style.width = `${size}px`;
      b.style.height = `${size}px`;
      b.style.left = `${left}%`;
      b.style.bottom = '0';
      b.style.animationDuration = `${duration}s`;
      b.style.animationDelay = `${delay}s`;

      containerRef.current.appendChild(b);

      setTimeout(() => {
        if (b.parentNode === containerRef.current) {
          containerRef.current.removeChild(b);
        }
      }, (duration + delay) * 1000 + 500);
    }, 400);

    return () => clearInterval(interval);
  }, []);

  return <div id="bbls" ref={containerRef} />;
}

export default Bubbles;
