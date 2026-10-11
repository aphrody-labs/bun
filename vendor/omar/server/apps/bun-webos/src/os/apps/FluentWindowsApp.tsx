// SPDX-License-Identifier: Apache-2.0
/**
 * Windows 11 (Fluent 2): the host snapshot from /api/webos/system shown with Fluent UI web
 * components v3, themed by the Fluent 2 web tokens; the switch toggles light and dark.
 */
import React, { useEffect, useRef, useState } from "react";
import { applyFluentTheme } from "../fluent";
import { useWindowReady } from "../ready";
import { formatBytes, useSystemSnapshot } from "../system-client";

export const FluentWindowsApp: React.FC = () => {
  const setReady = useWindowReady();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLElement>(null);
  const [dark, setDark] = useState(true);
  const { snapshot, error } = useSystemSnapshot(5000);

  useEffect(() => {
    if (root.current) applyFluentTheme(dark, root.current);
  }, [dark]);

  useEffect(() => {
    const el = toggle.current;
    if (!el) return;
    const onChange = () => setDark((el as HTMLElement & { checked: boolean }).checked);
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (snapshot || error) setReady(true);
  }, [snapshot, error, setReady]);

  const memory = snapshot?.memory;
  const used = memory ? memory.usedBytes / memory.totalBytes : 0;

  return (
    <div
      ref={root}
      data-webos-fluent=""
      className="flex h-full flex-col gap-3 overflow-auto p-4"
      style={{
        background: "var(--colorNeutralBackground2)",
        color: "var(--colorNeutralForeground1)",
        fontFamily: "var(--fontFamilyBase)",
      }}
    >
      <div className="flex items-center gap-3">
        <fluent-text size="500" weight="semibold">
          Windows 11 · Fluent 2
        </fluent-text>
        <fluent-badge appearance="tint">@fluentui/web-components v3</fluent-badge>
        <span className="flex-1" />
        <fluent-switch ref={toggle} checked={dark ? true : undefined} data-webos-action="fluent-dark">
          Sombre
        </fluent-switch>
      </div>
      <fluent-divider />
      {error && <fluent-text>{error}</fluent-text>}
      {!snapshot && !error && <fluent-spinner size="small" />}
      {snapshot && (
        <div className="grid grid-cols-2 gap-3">
          <fluent-field>
            <fluent-label slot="label">Hôte</fluent-label>
            <fluent-text-input slot="input" readonly value={snapshot.host.hostname} />
          </fluent-field>
          <fluent-field>
            <fluent-label slot="label">Bun</fluent-label>
            <fluent-text-input slot="input" readonly value={snapshot.runtime.bun} />
          </fluent-field>
          <fluent-field>
            <fluent-label slot="label">
              Mémoire {formatBytes(memory?.usedBytes)} / {formatBytes(memory?.totalBytes)}
            </fluent-label>
            <fluent-progress-bar slot="input" value={String(Math.round(used * 100))} max="100" />
          </fluent-field>
          <fluent-field>
            <fluent-label slot="label">CPU ({snapshot.cpu.count} cœurs)</fluent-label>
            <fluent-slider
              slot="input"
              readonly
              disabled
              min="0"
              max="100"
              value={String(snapshot.cpu.usagePercent ?? 0)}
            />
          </fluent-field>
          <fluent-checkbox checked={snapshot.linux ? true : undefined} disabled>
            Noyau Linux ({snapshot.host.platform})
          </fluent-checkbox>
          <fluent-button appearance="primary" onClick={() => location.reload()}>
            Recharger le bureau
          </fluent-button>
        </div>
      )}
    </div>
  );
};
