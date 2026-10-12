import { notFound } from "next/navigation";

// Unknown paths under a locale reach [locale]/not-found.tsx (and its title)
// through this catch all, instead of Next's unbranded default 404.
export default function CatchAllNotFound() {
  notFound();
}
