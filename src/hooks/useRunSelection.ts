"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Multi-select state for run list rows.
 * Tracks selected run IDs and provides toggle/select-all helpers.
 */
export function useRunSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selected.has(id)),
    [visibleIds, selected],
  );

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  }, [allSelected, visibleIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const count = useMemo(
    () => visibleIds.filter((id) => selected.has(id)).length,
    [visibleIds, selected],
  );

  return { selected, toggle, allSelected, toggleAll, clear, count };
}
