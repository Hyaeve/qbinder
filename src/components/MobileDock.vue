<template>
  <aside ref="root" class="sidebar mobile-dock" @keydown.esc="closeMore(true)">
    <nav aria-label="手机导航" :style="{ gridTemplateColumns: `repeat(${visibleDockItems.length + (hiddenDockItems.length ? 1 : 0)}, minmax(0, 1fr))` }">
      <button v-for="item in visibleDockItems" :key="item.id" :class="{ active: view === item.id }" :aria-label="item.label" :aria-current="view === item.id ? 'page' : undefined" @click="select(item.id)">
        <component :is="item.icon" /><span>{{ item.label }}</span>
      </button>
      <button v-if="hiddenDockItems.length" ref="moreButton" class="dock-more-button" :class="{ active: hiddenDockItems.some(item => item.id === view) }" aria-label="更多" :aria-expanded="open" aria-controls="dock-more-pages" @click="open = !open">
        <Ellipsis /><span>更多</span>
      </button>
    </nav>
    <div v-if="open && hiddenDockItems.length" id="dock-more-pages" class="dock-more-menu" aria-label="更多页面">
      <button v-for="item in hiddenDockItems" :key="item.id" :class="{ active: view === item.id }" :aria-current="view === item.id ? 'page' : undefined" @click="select(item.id)">
        <component :is="item.icon" /><span>{{ item.label }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { Ellipsis } from '@lucide/vue';
import { visibleDockItems, hiddenDockItems } from '../dock';

const props = defineProps({ view: String });
const emit = defineEmits(['navigate']);
const root = ref(null);
const moreButton = ref(null);
const open = ref(false);
function closeMore(focus = false) {
  open.value = false;
  if (focus) moreButton.value?.focus();
}
function select(id) { closeMore(); emit('navigate', id); }
function outside(event) { if (!root.value?.contains(event.target)) closeMore(); }
watch(() => props.view, () => closeMore());
onMounted(() => document.addEventListener('pointerdown', outside));
onUnmounted(() => document.removeEventListener('pointerdown', outside));
</script>
