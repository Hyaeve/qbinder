<template>
  <section class="setting-panel dock-settings">
    <h2><PanelsTopLeft />Dock 栏设置</h2>
    <div class="dock-settings-list">
      <div v-for="(item, index) in dockItems" :key="item.id" class="dock-setting-row" :class="{ dragging: dragging === item.id, 'drag-over': target === index }" :data-dock-id="item.id">
        <button class="dock-drag-handle" :aria-label="`拖拽排序${item.label}`" @pointerdown="startDrag(item.id, $event)" @pointermove="moveDrag" @pointerup="finishDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @keydown.up.prevent="moveDockItem(item.id, index - 1)" @keydown.down.prevent="moveDockItem(item.id, index + 1)"><GripVertical /></button>
        <label class="dock-setting-toggle"><input type="checkbox" :checked="item.enabled" :disabled="item.enabled && visibleDockItems.length === 1" :aria-label="`在 Dock 显示${item.label}`" @change="toggleDockItem(item.id)" /><span>{{ item.label }}</span></label>
        <div class="dock-order-actions">
          <button :disabled="index === 0" :aria-label="`上移${item.label}`" @click="moveDockItem(item.id, index - 1)"><ChevronUp /></button>
          <button :disabled="index === dockItems.length - 1" :aria-label="`下移${item.label}`" @click="moveDockItem(item.id, index + 1)"><ChevronDown /></button>
        </div>
      </div>
    </div>
    <p v-if="dockSaveError" class="form-error">{{ dockSaveError }}</p>
  </section>
</template>

<script setup>
import { ref, onUnmounted } from 'vue';
import { PanelsTopLeft, GripVertical, ChevronUp, ChevronDown } from '@lucide/vue';
import { dockItems, visibleDockItems, dockSaveError, toggleDockItem, moveDockItem } from '../dock';
const dragging = ref('');
const target = ref(-1);
let pointer = null;
let scrollFrame = 0;
let position = null;
function updateTarget() {
  if (!position) return;
  const row = document.elementFromPoint(position.x, position.y)?.closest('[data-dock-id]');
  target.value = dockItems.value.findIndex((item) => item.id === row?.dataset.dockId);
}
function scrollDrag() {
  if (pointer === null || !position) return;
  const delta = position.y < 70 ? -10 : position.y > window.innerHeight - 100 ? 10 : 0;
  if (delta) { window.scrollBy(0, delta); updateTarget(); }
  scrollFrame = requestAnimationFrame(scrollDrag);
}
function startDrag(id, event) {
  if (!event.isPrimary || event.button !== 0) return;
  dragging.value = id;
  pointer = event.pointerId;
  position = { x: event.clientX, y: event.clientY };
  scrollFrame = requestAnimationFrame(scrollDrag);
  event.currentTarget.setPointerCapture(pointer);
  event.preventDefault();
}
function moveDrag(event) {
  if (event.pointerId !== pointer) return;
  position = { x: event.clientX, y: event.clientY };
  updateTarget();
}
function finishDrag(event) {
  if (event.pointerId !== pointer) return;
  moveDrag(event);
  moveDockItem(dragging.value, target.value);
  cancelDrag();
}
function cancelDrag() {
  cancelAnimationFrame(scrollFrame);
  dragging.value = ''; target.value = -1; pointer = null; position = null;
}
onUnmounted(cancelDrag);
</script>
