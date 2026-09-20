<template>
  <div ref="root" class="traffic-range-picker" @keydown.esc="close(true)">
    <button ref="trigger" class="traffic-range-trigger" aria-label="统计时间范围" aria-haspopup="listbox" :aria-expanded="open" @click="open = !open">
      <span>{{ options.find(option => option.value === modelValue)?.label }}</span><ChevronDown />
    </button>
    <Transition name="range-menu">
      <div v-if="open" class="traffic-range-menu" role="listbox" aria-label="统计时间范围">
        <button v-for="option in options" :key="option.value" role="option" :aria-selected="option.value === modelValue" @click="select(option.value)">{{ option.label }}</button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { ChevronDown } from '@lucide/vue';
defineProps({ modelValue: String, options: Array });
const emit = defineEmits(['update:modelValue']);
const root = ref(null);
const trigger = ref(null);
const open = ref(false);
function close(focus = false) { open.value = false; if (focus) trigger.value?.focus(); }
function select(value) { emit('update:modelValue', value); close(true); }
function outside(event) { if (!root.value?.contains(event.target)) close(); }
onMounted(() => document.addEventListener('pointerdown', outside));
onUnmounted(() => document.removeEventListener('pointerdown', outside));
</script>
