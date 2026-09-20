import { computed, ref, watch } from 'vue';
import { Boxes, Table2, Gauge, ListTodo, ScrollText, Settings } from '@lucide/vue';

export const dockPages = [
  { id: 'cards', label: '卡片', icon: Boxes },
  { id: 'torrents', label: '视图', icon: Table2 },
  { id: 'traffic', label: '域流', icon: Gauge },
  { id: 'tasks', label: '任务', icon: ListTodo },
  { id: 'logs', label: '日志', icon: ScrollText },
  { id: 'settings', label: '设置', icon: Settings }
];
const storageKey = 'qbinder-mobile-dock';
const defaults = () => dockPages.map((page, index) => ({ id: page.id, enabled: index < 3 }));

function loadDock() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!Array.isArray(saved)) return defaults();
    const ids = new Set();
    const entries = saved.filter((entry) => {
      if (!entry || !dockPages.some((page) => page.id === entry.id) || ids.has(entry.id)) return false;
      ids.add(entry.id);
      return true;
    }).map((entry) => ({ id: entry.id, enabled: entry.enabled === true }));
    entries.push(...defaults().filter((entry) => !ids.has(entry.id)));
    if (!entries.some((entry) => entry.enabled)) entries[0].enabled = true;
    return entries;
  } catch { return defaults(); }
}

export const dockEntries = ref(loadDock());
export const dockItems = computed(() => dockEntries.value.map((entry) => ({
  ...dockPages.find((page) => page.id === entry.id), enabled: entry.enabled
})));
export const visibleDockItems = computed(() => dockItems.value.filter((entry) => entry.enabled));
export const hiddenDockItems = computed(() => dockItems.value.filter((entry) => !entry.enabled));
export const dockSaveError = ref('');
watch(dockEntries, (entries) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
    dockSaveError.value = '';
  } catch { dockSaveError.value = '无法保存 Dock 设置，请检查浏览器存储权限。'; }
}, { deep: true });

export function toggleDockItem(id) {
  const entry = dockEntries.value.find((item) => item.id === id);
  if (!entry || (entry.enabled && visibleDockItems.value.length === 1)) return;
  entry.enabled = !entry.enabled;
}

export function moveDockItem(id, targetIndex) {
  const entries = [...dockEntries.value];
  const index = entries.findIndex((entry) => entry.id === id);
  if (index < 0 || targetIndex < 0 || targetIndex >= entries.length || index === targetIndex) return;
  const [entry] = entries.splice(index, 1);
  entries.splice(targetIndex, 0, entry);
  dockEntries.value = entries;
}
