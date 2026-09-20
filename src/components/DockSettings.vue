<template>
  <section class="setting-panel dock-settings">
    <h2><PanelsTopLeft />Dock 标签栏</h2>
    <TransitionGroup name="dock-row" tag="div" class="dock-settings-list">
      <div v-for="(item, index) in dockItems" :key="item.id" class="dock-setting-row" :class="{ dragging: dragging === item.id }" :data-dock-id="item.id" :style="dragging === item.id ? { transform: `translateY(${dragOffset}px)` } : undefined">
        <label class="dock-setting-toggle"><input type="checkbox" role="switch" :checked="item.enabled" :disabled="item.enabled && visibleDockItems.length === 1" :aria-label="`在 Dock 显示${item.label}`" @change="toggleDockItem(item.id)" /><span class="dock-toggle-track" aria-hidden="true"></span><component :is="item.icon" /><span>{{ item.label }}</span></label>
        <button class="dock-drag-handle" :aria-label="`拖拽排序${item.label}`" @pointerdown="startDrag(item.id, $event)" @keydown.up.prevent="moveDockItem(item.id, index - 1)" @keydown.down.prevent="moveDockItem(item.id, index + 1)"><Menu /></button>
      </div>
    </TransitionGroup>
    <p v-if="dockSaveError" class="form-error">{{ dockSaveError }}</p>
  </section>
</template>

<script setup>
import { ref, nextTick, onUnmounted } from 'vue';
import { PanelsTopLeft, Menu } from '@lucide/vue';
import { dockEntries, dockItems, visibleDockItems, dockSaveError, toggleDockItem, moveDockItem } from '../dock';
const dragging = ref('');
const target = ref(-1);
const dragOffset = ref(0);
let original = null;
let rowElement = null;
let grabOffset = 0;
let baseTop = 0;
let updating = false;
let rowHeight = 54;
let rowStep = 62;
let pointer = null;
let scrollFrame = 0;
let position = null;
function updateTarget() {
  if (!position || !rowElement || updating) return;
  const list = rowElement.parentElement;
  const listTop = list.getBoundingClientRect().top - list.scrollTop;
  const current = dockItems.value.findIndex(item => item.id === dragging.value);
  baseTop = listTop + current * rowStep;
  dragOffset.value = position.y - grabOffset - baseTop;
  // Hit-test stable row slots, not the animated/transformed sibling rectangles.
  target.value = Math.max(0, Math.min(dockItems.value.length - 1,
    Math.floor((position.y - grabOffset + rowHeight / 2 - listTop) / rowStep)));
  if (target.value === current) return;
  updating = true;
  moveDockItem(dragging.value, target.value);
  nextTick(() => {
    if (rowElement && position) {
      baseTop = rowElement.parentElement.getBoundingClientRect().top - rowElement.parentElement.scrollTop + dockItems.value.findIndex(item => item.id === dragging.value) * rowStep;
      dragOffset.value = position.y - grabOffset - baseTop;
    }
    updating = false;
  });
}
function scrollDrag() {
  if (pointer === null || !position) return;
  const list = rowElement?.parentElement;
  if (!list) return;
  const bounds = list.getBoundingClientRect();
  const delta = position.y < bounds.top + 32 ? -6 : position.y > bounds.bottom - 32 ? 6 : 0;
  if (delta) { list.scrollTop += delta; updateTarget(); }
  scrollFrame = requestAnimationFrame(scrollDrag);
}
function startDrag(id, event) {
  if (!event.isPrimary || event.button !== 0) return;
  dragging.value = id;
  original = dockEntries.value.map(entry => ({ ...entry }));
  rowElement = event.currentTarget.closest('[data-dock-id]');
  baseTop = rowElement.getBoundingClientRect().top;
  rowHeight = rowElement.getBoundingClientRect().height;
  rowStep = rowHeight + parseFloat(getComputedStyle(rowElement.parentElement).rowGap || '0');
  grabOffset = event.clientY - baseTop;
  pointer = event.pointerId;
  position = { x: event.clientX, y: event.clientY };
  scrollFrame = requestAnimationFrame(scrollDrag);
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', cancelDrag);
  event.preventDefault();
}
function moveDrag(event) {
  if (event.pointerId !== pointer) return;
  position = { x: event.clientX, y: event.clientY };
  updateTarget();
}
function finishDrag(event) {
  if (event.pointerId !== pointer) return;
  original = null;
  cancelDrag();
}
function cancelDrag() {
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', finishDrag);
  window.removeEventListener('pointercancel', cancelDrag);
  cancelAnimationFrame(scrollFrame);
  if (original) dockEntries.value = original;
  original = null; rowElement = null; dragOffset.value = 0;
  dragging.value = ''; target.value = -1; pointer = null; position = null;
}
onUnmounted(cancelDrag);
</script>
