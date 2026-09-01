"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type AnalysisScrollCardProps = {
  className?: string;
  children: ReactNode;
};

export default function AnalysisScrollCard({
  className = "",
  children,
}: AnalysisScrollCardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [thumbTop, setThumbTop] = useState(0);
  const [showThumb, setShowThumb] = useState(false);

  const THUMB_HEIGHT = 26;

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const updateThumb = () => {
      const maxScroll =
        element.scrollHeight - element.clientHeight;

      setShowThumb(maxScroll > 2);

      if (maxScroll <= 0) {
        setThumbTop(0);
        return;
      }

      const availableTrack =
        element.clientHeight - THUMB_HEIGHT - 12;

      const progress =
        element.scrollTop / maxScroll;

      setThumbTop(
        Math.max(
          6,
          Math.min(
            availableTrack + 6,
            6 + progress * availableTrack,
          ),
        ),
      );
    };

    updateThumb();

    element.addEventListener("scroll", updateThumb, {
      passive: true,
    });

    const observer = new ResizeObserver(updateThumb);

    observer.observe(element);

    return () => {
      element.removeEventListener(
        "scroll",
        updateThumb,
      );

      observer.disconnect();
    };
  }, []);

  return (
    <div className={`analysis-custom-scroll ${className}`}>
      <div
        ref={scrollRef}
        className="analysis-custom-scroll-content"
      >
        {children}
      </div>

      {showThumb && (
        <div className="analysis-custom-scroll-track">
          <div
            className="analysis-custom-scroll-thumb"
            style={{
              height: `${THUMB_HEIGHT}px`,
              transform: `translateY(${thumbTop}px)`,
            }}
          />
        </div>
      )}
    </div>
  );
}
