"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCurrentStore() {
  const [storeId, setStoreId] = useState<string>("nantong");

  useEffect(() => {
    const saved = localStorage.getItem("current_store");
    if (saved) setStoreId(saved);
  }, []);

  const switchStore = (id: string) => {
    setStoreId(id);
    localStorage.setItem("current_store", id);
  };

  return { storeId, switchStore };
}

export function useStores() {
  const { data, error, isLoading } = useSWR("/api/config/stores", fetcher);

  return {
    stores: (data?.stores || []) as { id: string; name: string; default_warehouse: string }[],
    isLoading,
    error,
  };
}

export function useAuth() {
  const { data, error, isLoading, mutate } = useSWR("/api/auth/me", fetcher, {
    revalidateOnFocus: false,
  });

  return {
    user: data?.user || null,
    isLoading,
    isAuthenticated: !!data?.user,
    error,
    logout: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      mutate(undefined);
    },
  };
}
