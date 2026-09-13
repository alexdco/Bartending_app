"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Text } from "@/components/text";

const CARD_WIDTH = "w-[45vw] sm:w-[240px]";
const SCROLL_AMOUNT = 480;

export interface CarouselProps {
  title: string;
  seeMoreHref?: string;
  children: ReactNode;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CarouselArrow({
  direction,
  onClick,
  disabled,
}: {
  direction: "left" | "right";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Scroll left" : "Scroll right"}
      className={`absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-text shadow-md disabled:pointer-events-none disabled:opacity-0 hover:bg-surface-selected ${
        direction === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"
      }`}
    >
      <ChevronIcon direction={direction} />
    </button>
  );
}

export function Carousel({ title, seeMoreHref, children }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    setCanScrollLeft(track.scrollLeft > 0);
    setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(track);
    return () => observer.disconnect();
  }, [updateScrollState, children]);

  const scrollBy = (amount: number) => {
    trackRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <section className="flex flex-col gap-three">
      <div className="flex items-center justify-between">
        <Text variant="heading" as="h2">
          {title}
        </Text>
        {seeMoreHref && (
          <Link href={seeMoreHref}>
            <Text variant="label" as="span">
              See more
            </Text>
          </Link>
        )}
      </div>
      <div className="relative">
        <CarouselArrow
          direction="left"
          onClick={() => scrollBy(-SCROLL_AMOUNT)}
          disabled={!canScrollLeft}
        />
        <div
          ref={trackRef}
          onScroll={updateScrollState}
          className="no-scrollbar flex snap-x snap-mandatory gap-three overflow-x-auto"
        >
          {children}
        </div>
        <CarouselArrow
          direction="right"
          onClick={() => scrollBy(SCROLL_AMOUNT)}
          disabled={!canScrollRight}
        />
      </div>
    </section>
  );
}

export function CarouselItem({ children }: { children: ReactNode }) {
  return <div className={`shrink-0 snap-start ${CARD_WIDTH}`}>{children}</div>;
}

export function CarouselSkeleton({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-three" aria-hidden="true">
      <Text variant="heading" as="h2">
        {title}
      </Text>
      <div className="flex gap-three overflow-x-hidden pb-two">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className={`shrink-0 animate-pulse rounded-large bg-surface ${CARD_WIDTH}`}
            style={{ aspectRatio: "3 / 4" }}
          />
        ))}
      </div>
    </section>
  );
}
