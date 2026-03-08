"use client";

import { useEffect, useState } from "react";
import { pluginRegistry, PluginManifest } from "@/lib/plugins";
import { Puzzle, Power } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "olgax_plugin_enabled_map";

function loadEnabledMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveEnabledMap(map: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = loadEnabledMap();
    const list = pluginRegistry.getPlugins();
    // Apply persisted enabled state
    for (const p of list) {
      if (stored[p.id] !== undefined) {
        pluginRegistry.setEnabled(p.id, stored[p.id]);
        p.enabled = stored[p.id];
      }
    }
    setPlugins(list);
    const map: Record<string, boolean> = {};
    for (const p of list) map[p.id] = p.enabled;
    setEnabledMap(map);
  }, []);

  function toggle(id: string) {
    const next = !enabledMap[id];
    pluginRegistry.setEnabled(id, next);
    const newMap = { ...enabledMap, [id]: next };
    setEnabledMap(newMap);
    saveEnabledMap(newMap);
    setPlugins(pluginRegistry.getPlugins());
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Puzzle className="h-4 w-4" />
          Plugins
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Installed plugins extend POS functionality via hooks. Place plugin folders in{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-[11px]">/plugins/</code>.
        </p>
      </div>

      {plugins.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Puzzle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No plugins installed. Drop a plugin folder into{" "}
          <code className="bg-muted rounded px-1 text-xs">/plugins/</code> and register it in your app.
        </div>
      ) : (
        <div className="rounded-lg border divide-y overflow-hidden">
          {plugins.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                    v{p.version}
                  </span>
                  {p.author && (
                    <span className="text-[10px] text-muted-foreground">by {p.author}</span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.hooks.map((h) => (
                    <span
                      key={h}
                      className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  "flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  enabledMap[p.id]
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                aria-label={enabledMap[p.id] ? "Disable plugin" : "Enable plugin"}
              >
                <Power className="h-3 w-3" />
                {enabledMap[p.id] ? "Enabled" : "Disabled"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
