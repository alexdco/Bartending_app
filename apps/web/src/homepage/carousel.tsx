import type { ReactNode } from "react";
import Link from "next/link";
import { Text } from "@/components/text";

const CARD_WIDTH = "w-[45vw] sm:w-[240px]";

export interface CarouselProps {
  title: string;
  seeMoreHref?: string;
  children: ReactNode;
}

export function Carousel({ title, seeMoreHref, children }: CarouselProps) {
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
      <div className="flex snap-x snap-mandatory gap-three overflow-x-auto pb-two">{children}</div>
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
