<template>
  <aside ref="root" class="sidebar mobile-dock" :class="{ 'dock-hidden': hidden, 'dock-previewing': previewIndex !== null }" :inert="hidden" @pointerdown.capture="suppressClick = false" @keydown="suppressClick = false" @contextmenu.prevent @keydown.esc="closeMore(true)" :style="{ '--dock-count': visibleDockItems.length + 1 }">
    <nav aria-label="手机导航" :style="{ gridTemplateColumns: `repeat(${visibleDockItems.length + 1}, minmax(0, 1fr))` }">
      <span class="dock-selection" aria-hidden="true" :style="{ transform: `translateX(${(previewIndex ?? activeIndex) * 100}%)` }"></span>
      <button v-for="(item, index) in visibleDockItems" :key="item.id" :class="{ active: (previewIndex ?? activeIndex) === index }" :aria-label="item.label" :aria-current="view === item.id ? 'page' : undefined" @pointerdown="startPress($event, index)" @pointerup="endPress" @pointercancel="cancelPress" @pointermove="movePress" @pointerleave="cancelPress" @click="select(item.id)">
        <component :is="item.icon" /><span>{{ item.label }}</span>
      </button>
      <button ref="moreButton" class="dock-more-button" :class="{ active: (previewIndex ?? activeIndex) === visibleDockItems.length }" aria-label="更多" :aria-expanded="open" aria-controls="dock-more-pages" @pointerdown="startPress($event, visibleDockItems.length)" @pointerup="endPress" @pointercancel="cancelPress" @pointermove="movePress" @pointerleave="cancelPress" @click="toggleMore">
        <Ellipsis /><span>更多</span>
      </button>
    </nav>
    <Transition name="dock-menu">
    <div v-if="open" id="dock-more-pages" class="dock-more-menu" aria-label="更多页面">
      <button v-for="item in hiddenDockItems" :key="item.id" :class="{ active: view === item.id }" :aria-current="view === item.id ? 'page' : undefined" @click="select(item.id)">
        <component :is="item.icon" /><span>{{ item.label }}</span>
      </button>
      <button class="dock-logout" @click="closeMore(); emit('logout')"><LogOut /><span>退出</span></button>
    </div>
    </Transition>
  </aside>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Ellipsis, LogOut } from '@lucide/vue';
import { visibleDockItems, hiddenDockItems } from '../dock';

const props = defineProps({ view: String });
const emit = defineEmits(['navigate', 'logout']);
const root = ref(null);
const moreButton = ref(null);
const open = ref(false);
const hidden = ref(false);
const previewIndex = ref(null);
let pressTimer;
let pressOrigin;
let suppressClick = false;
function startPress(event, index) {
  if (event.button !== 0 || !event.isPrimary) return;
  cancelPress();
  suppressClick = false;
  pressOrigin = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => { previewIndex.value = index; haptic(); }, 180);
}
function cancelPress() {
  clearTimeout(pressTimer);
  if (pressOrigin) suppressClick = true;
  pressOrigin = null;
  previewIndex.value = null;
}
function movePress(event) {
  if (pressOrigin && Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 12) cancelPress();
}
function endPress() {
  clearTimeout(pressTimer);
  pressOrigin = null;
}
const activeIndex = computed(() => {
  const index = visibleDockItems.value.findIndex(item => item.id === props.view);
  return index < 0 ? visibleDockItems.value.length : index;
});
let lastY = 0;
let distance = 0;
let ignoreScrollUntil = 0;
function scroll() {
  const y = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - innerHeight));
  const delta = y - lastY;
  lastY = y;
  if (performance.now() < ignoreScrollUntil || document.body.style.overflow === 'hidden') return;
  if (y < 12) { hidden.value = false; distance = 0; return; }
  if (Math.sign(delta) !== Math.sign(distance)) distance = 0;
  distance += delta;
  if (distance > 36) { hidden.value = true; closeMore(); }
  else if (distance < -20) hidden.value = false;
}
function closeMore(focus = false) {
  cancelPress();
  open.value = false;
  if (focus) moreButton.value?.focus();
}
function haptic() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { navigator.vibrate?.(8); } catch { /* Haptics are optional. */ }
}
function toggleMore() {
  if (suppressClick) { suppressClick = false; return; }
  previewIndex.value = null; haptic(); open.value = !open.value;
}
function select(id) {
  if (suppressClick) { suppressClick = false; return; }
  if (id !== props.view) haptic();
  closeMore(); emit('navigate', id);
}
function outside(event) { if (!root.value?.contains(event.target)) closeMore(); }
watch(() => props.view, () => {
  closeMore(); hidden.value = false; distance = 0; lastY = window.scrollY;
  ignoreScrollUntil = performance.now() + 450;
});
onMounted(() => {
  lastY = window.scrollY;
  document.addEventListener('pointerdown', outside);
  window.addEventListener('scroll', scroll, { passive: true });
});
onUnmounted(() => {
  cancelPress();
  document.removeEventListener('pointerdown', outside);
  window.removeEventListener('scroll', scroll);
});
</script>
