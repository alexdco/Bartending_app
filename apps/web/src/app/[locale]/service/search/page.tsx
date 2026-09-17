import { Suspense } from "react";
import { BartenderSearchPageClient } from "@/service/bartender-search-page-client";

export default function BartenderSearchPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <BartenderSearchPageClient />
      </Suspense>
    </main>
  );
}
