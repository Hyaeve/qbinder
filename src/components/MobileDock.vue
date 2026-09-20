<template>
  <aside ref="root" class="sidebar mobile-dock" :class="{ 'dock-hidden': hidden }" :inert="hidden" @keydown.esc="closeMore(true)" :style="{ '--dock-count': visibleDockItems.length + (hiddenDockItems.length ? 1 : 0) }">
    <nav aria-label="手机导航" :style="{ gridTemplateColumns: `repeat(${visibleDockItems.length + (hiddenDockItems.length ? 1 : 0)}, minmax(0, 1fr))` }">
      <span class="dock-selection" aria-hidden="true" :style="{ transform: `translateX(${activeIndex * 100}%)` }"></span>
      <button v-for="item in visibleDockItems" :key="item.id" :class="{ active: view === item.id }" :aria-label="item.label" :aria-current="view === item.id ? 'page' : undefined" @click="select(item.id)">
        <component :is="item.icon" /><span>{{ item.label }}</span>
      </button>
      <button v-if="hiddenDockItems.length" ref="moreButton" class="dock-more-button" :class="{ active: hiddenDockItems.some(item => item.id === view) }" aria-label="更多" :aria-expanded="open" aria-controls="dock-more-pages" @click="open = !open">
        <Ellipsis /><span>更多</span>
      </button>
    </nav>
    <Transition name="dock-menu">
    <div v-if="open && hiddenDockItems.length" id="dock-more-pages" class="dock-more-menu" aria-label="更多页面">
      <button v-for="item in hiddenDockItems" :key="item.id" :class="{ active: view === item.id }" :aria-current="view === item.id ? 'page' : undefined" @click="select(item.id)">
        <component :is="item.icon" /><span>{{ item.label }}</span>
      </button>
    </div>
    </Transition>
  </aside>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Ellipsis } from '@lucide/vue';
import { visibleDockItems, hiddenDockItems } from '../dock';

const props = defineProps({ view: String });
const emit = defineEmits(['navigate']);
const root = ref(null);
const moreButton = ref(null);
const open = ref(false);
const hidden = ref(false);
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
  if (distance > 18) { hidden.value = true; closeMore(); }
  else if (distance < -12) hidden.value = false;
}
function closeMore(focus = false) {
  open.value = false;
  if (focus) moreButton.value?.focus();
}
function select(id) { closeMore(); emit('navigate', id); }
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
  document.removeEventListener('pointerdown', outside);
  window.removeEventListener('scroll', scroll);
});
</script>
