// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useState } from "react";
import { api, errorText } from "../api";

export function ExplorerServices({
  resources,
  cache,
}: {
  resources: { id: string; name: string; canonical_path: string }[];
  cache?: { available: boolean; keys: number; memoryBytes: number } | null;
}) {
  const [services, setServices] = useState<{ id: string; healthy: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const health = async () => {
      try {
        const result = await api<{ services?: { id: string; healthy: boolean }[] }>(
          "/api/explorer/services",
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setServices(result.services ?? []);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(errorText(e));
      }
    };
    void health();
    const timer = setInterval(() => void health(), 10_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      {cache?.available && (
        <section>
          <h3 className="text-sm font-semibold">Configured cache</h3>
          <p className="text-xs">
            {cache.keys} keys · {Math.round(cache.memoryBytes / 1048576)} MiB
          </p>
        </section>
      )}
      <section>
        <h3 className="text-sm font-semibold">Service health</h3>
        {error && (
          <p role="status" className="mt-2 text-xs opacity-70">
            {error}
          </p>
        )}
        {services.map((service) => (
          <div
            key={service.id}
            className="flex justify-between border-b border-white/10 p-2 text-xs"
          >
            <span>{service.id}</span>
            <span>{service.healthy ? "Healthy" : "Unavailable"}</span>
          </div>
        ))}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Indexed resources</h3>
        {resources.map((resource) => (
          <article key={resource.id} className="border-b border-white/10 pb-3">
            <h4 className="text-sm">{resource.name}</h4>
            <p className="mt-1 break-all text-xs opacity-65">{resource.canonical_path}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
