"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCurrentStore() {
  const [storeId, setStoreId] = useState<string>("");
  const { stores } = useStores();

  useEffect(() => {
    if (stores.length === 0) return;

    const saved = localStorage.getItem("current_store");
    // 铁律：只有用户明确选过的店铺（localStorage有记录且有效）才自动恢复
    // 没选过就保持空，不自动选第一个
    const isValid = saved && stores.some((s: { id: string }) => s.id === saved);
    if (isValid && saved) {
      setStoreId(saved);
    } else {
      setStoreId("");
      localStorage.removeItem("current_store");
    }
  }, [stores]);

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
