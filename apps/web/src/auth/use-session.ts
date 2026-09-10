"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export interface SessionState {
  session: Session | null;
  isLinked: boolean;
  isLoading: boolean;
  expired: boolean;
}

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      sessionRef.current = data.session;
      setSession(data.session);
      setIsLoading(false);
    });

    let sawTokenRefreshed = false;

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "TOKEN_REFRESHED") {
        sawTokenRefreshed = true;
      }

      if (event === "SIGNED_OUT") {
        const previousSession = sessionRef.current;
        if (sawTokenRefreshed && previousSession?.user && !previousSession.user.is_anonymous) {
          setExpired(true);
        }
        sawTokenRefreshed = false;
      } else {
        setExpired(false);
      }

      sessionRef.current = nextSession;
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return {
    session,
    isLinked: Boolean(session?.user && !session.user.is_anonymous),
    isLoading,
    expired,
  };
}
