<template>
  <div v-if="loading" class="loading-screen"><Loader2 class="spin" />qBinder</div>

  <main v-else-if="!user || !config" class="login-page">
    <section class="login-panel">
      <div class="brand-lockup big">
        <img src="/logo.svg" alt="qBinder" />
        <div>
          <strong>qBinder</strong>
          <p class="brand-note">把下载、分类和封面放在一起。</p>
        </div>
      </div>
      <form class="login-form" @submit.prevent="login">
        <label>账号<input v-model="loginForm.username" autocomplete="username" /></label>
        <label>密码<input v-model="loginForm.password" type="password" autocomplete="current-password" /></label>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button class="primary-button" :disabled="busy"><Loader2 v-if="busy" class="spin" /><KeyRound v-else />登录</button>
      </form>
    </section>
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand-lockup">
        <img src="/logo.svg" alt="qBinder" />
        <div><strong>qBinder</strong><span>v0.1</span></div>
      </div>
      <nav>
        <button :class="{ active: view === 'cards' }" @click="view = 'cards'"><Boxes />卡片</button>
        <button :class="{ active: view === 'settings' }" @click="view = 'settings'"><Settings />设置</button>
      </nav>
      <button class="ghost-button logout" @click="logout"><LogOut />退出</button>
    </aside>

    <div v-if="view === 'settings'" class="content settings-page">
      <header class="page-header">
        <div>
          <h1>设置</h1>
          <p>管理 qBinder 登录账号和 qBittorrent 连接。</p>
        </div>
      </header>

      <section class="settings-grid">
        <form class="setting-panel" @submit.prevent="saveCredentials">
          <h2><KeyRound />登录账号</h2>
          <label>账号<input v-model="credentialForm.username" /></label>
          <label>新密码<input v-model="credentialForm.password" type="password" /></label>
          <button class="primary-button"><Save />保存账号密码</button>
        </form>

        <section class="setting-panel wide">
          <h2><Layers />添加 qBittorrent</h2>
          <div class="qb-form">
            <label>别名<input v-model="qbForm.alias" @input="verified = false" /></label>
            <label>协议<select v-model="qbForm.protocol" @change="verified = false"><option>http</option><option>https</option></select></label>
            <label>地址<input v-model="qbForm.host" placeholder="192.168.1.10" @input="verified = false" /></label>
            <label>端口<input v-model="qbForm.port" @input="verified = false" /></label>
            <label>账号<input v-model="qbForm.username" @input="verified = false" /></label>
            <label>密码<input v-model="qbForm.password" type="password" @input="verified = false" /></label>
          </div>
          <p v-if="message" :class="verified ? 'form-ok' : 'form-error'">{{ message }}</p>
          <div class="button-row">
            <button type="button" class="secondary-button" @click="testQb"><CheckCircle2 />验证</button>
            <button type="button" class="primary-button" @click="addQb"><Plus />添加</button>
          </div>
        </section>

        <section class="setting-panel backup-panel">
          <h2><Save />配置备份</h2>
          <div class="backup-summary">
            <span>{{ config.qbittorrents.length }} 个 qB 账户</span>
            <span>{{ config.lanes.length }} 个横栏</span>
            <span>{{ config.cards.length }} 张卡片</span>
            <span>{{ config.tagPool.length }} 个标签</span>
          </div>
          <p v-if="backupMessage" :class="backupOk ? 'form-ok' : 'form-error'">{{ backupMessage }}</p>
          <input ref="backupFileInput" type="file" accept="application/json,.json" hidden @change="restoreBackup" />
          <div class="button-row">
            <button type="button" class="secondary-button" :disabled="backupBusy" @click="exportBackup"><Download />备份当前配置</button>
            <button type="button" class="primary-button" :disabled="backupBusy" @click="backupFileInput?.click()"><Upload />加载备份配置</button>
          </div>
        </section>
      </section>

      <section class="accounts-list">
        <h2>已配置 qB 账户</h2>
        <div v-if="config.qbittorrents.length === 0" class="empty-state">还没有添加 qBittorrent 账户。</div>
        <div v-for="account in config.qbittorrents" :key="account.id" class="account-row">
          <div>
            <strong>{{ account.alias }}</strong>
            <span>{{ account.protocol }}://{{ account.host }}:{{ account.port }}</span>
            <em>{{ accountStatus(account) }}</em>
          </div>
          <div class="account-actions">
            <button class="secondary-button" @click="editQb(account)">编辑</button>
            <button class="danger-button" @click="deleteQb(account.id)">删除</button>
          </div>
        </div>
      </section>
    </div>

    <div v-else class="content cards-page">
      <div v-if="config.qbittorrents.length === 0" class="empty-workspace">
        <img src="/logo.svg" alt="qBinder" />
        <h1>先添加 qBittorrent 账户</h1>
        <p>进入设置页面添加并验证连接后，就可以为不同 qB 账户创建卡片。</p>
      </div>

      <template v-else>
        <header class="top-tabs">
          <button v-for="account in config.qbittorrents" :key="account.id" :class="{ active: account.id === activeQb.id }" @click="activeQbId = account.id">{{ account.alias }}</button>
        </header>

        <form class="lane-create" @submit.prevent="addLane">
          <input v-model="laneName" placeholder="新增横栏名称" />
          <button class="primary-button icon-only" title="添加横栏" aria-label="添加横栏"><Plus /></button>
        </form>

        <div v-if="activeLanes.length === 0" class="empty-state">当前 qB 账户下还没有横栏。</div>
        <section
          v-for="(lane, laneIndex) in activeLanes"
          :key="lane.id"
          class="lane"
          :class="{ dragging: draggingLaneId === lane.id }"
          @dragover.prevent
          @drop="dropLane(laneIndex)"
        >
          <div class="lane-title">
            <div class="lane-heading">
              <input
                v-if="editingLaneId === lane.id"
                :ref="setLaneInput(lane.id)"
                v-model="editingLaneName"
                class="lane-name-input"
                aria-label="横栏名称"
                @keydown.enter.prevent="finishLaneEdit(lane)"
                @blur="finishLaneEdit(lane)"
              />
              <h2
                v-else
                draggable="true"
                title="拖拽移动横栏，双击编辑名称"
                @dragstart="startLaneDrag(lane.id, $event)"
                @dragend="draggingLaneId = ''"
                @dblclick="editLane(lane)"
              >{{ lane.name }}</h2>
            </div>
            <button class="icon-button" title="添加卡片" aria-label="添加卡片" @click="createCard(lane.id)"><Plus /></button>
          </div>
          <div class="card-row">
            <article v-for="card in cardsForLane(lane.id)" :key="card.id" class="binder-card" :style="coverStyle(card)" @contextmenu.prevent="editingCard = cloneCard(card)">
              <input :ref="setFileInput(card.id)" type="file" multiple accept=".torrent,application/x-bittorrent" hidden @change="uploadFiles(card, $event)" />
              <div class="card-content">
                <FolderDown />
                <h3>{{ card.name }}</h3>
                <p>{{ card.savePath || '未设置保存路径' }}</p>
                <div class="tag-list small">
                  <span v-for="tag in card.tags" :key="tag" :style="{ background: pickColor(tag) }">{{ tag }}</span>
                </div>
              </div>
              <button v-if="card.savePath" class="upload-overlay" :disabled="uploadingCardId === card.id" @click="fileInputs[card.id]?.click()">
                <Loader2 v-if="uploadingCardId === card.id" class="spin" />
                <UploadCloud v-else />
                <span>{{ uploadingCardId === card.id ? '上传中' : '添加种子' }}</span>
              </button>
            </article>
          </div>
        </section>
      </template>
    </div>

    <div v-if="editingQb" class="modal-backdrop">
      <section class="modal">
        <header>
          <h2>编辑 qBittorrent</h2>
          <button class="icon-button" @click="editingQb = null"><X /></button>
        </header>
        <label>别名<input v-model="editingQb.alias" /></label>
        <label>协议<select v-model="editingQb.protocol"><option>http</option><option>https</option></select></label>
        <label>地址<input v-model="editingQb.host" /></label>
        <label>端口<input v-model="editingQb.port" /></label>
        <label>账号<input v-model="editingQb.username" /></label>
        <label>新密码<input v-model="editingQb.password" type="password" placeholder="留空则不修改" /></label>
        <p v-if="editQbMessage" class="form-error">{{ editQbMessage }}</p>
        <div class="button-row">
          <button class="secondary-button" @click="testEditingQb"><CheckCircle2 />验证</button>
          <button class="primary-button" @click="saveQb"><Save />保存</button>
        </div>
      </section>
    </div>

    <div v-if="editingCard" class="modal-backdrop">
      <section class="modal">
        <header>
          <h2>卡片设置</h2>
          <button class="icon-button" @click="editingCard = null"><X /></button>
        </header>
        <label>卡片名称<input v-model="editingCard.name" /></label>
        <label>保存路径<input v-model="editingCard.savePath" placeholder="/downloads/movies" /></label>
        <div class="field-block">
          <span><Tags />种子标签</span>
          <div class="tag-editor">
            <button v-for="tag in editingCard.tags" :key="tag" :style="{ background: pickColor(tag) }" @click="removeTag(tag)">{{ tag }}<X /></button>
            <input v-model="tagInput" placeholder="输入后回车" @keydown.enter.prevent="addTag(tagInput)" />
          </div>
          <div class="tag-hints">
            <button v-for="tag in tagHints" :key="tag" class="tag-hint" @click="addTag(tag)">
              <span>{{ tag }}</span>
              <X class="tag-delete" title="删除标签" @click.stop="deletePoolTag(tag)" />
            </button>
          </div>
        </div>
        <div class="field-block">
          <span><ImageIcon />封面显示</span>
          <div class="segmented">
            <button :class="{ active: coverMode === 'monet' }" @click="coverMode = 'monet'">莫奈配色</button>
            <button :class="{ active: coverMode === 'image' }" @click="coverMode = 'image'">图片</button>
          </div>
          <div v-if="coverMode === 'image'" class="cover-inputs">
            <input :value="imageUrlValue" placeholder="图片地址" @input="setImageUrl" />
            <label class="file-button">上传图片<input type="file" accept="image/*" hidden @change="loadLocalCover" /></label>
          </div>
        </div>
        <div class="modal-actions split">
          <button class="danger-button" @click="deleteCard"><X />删除卡片</button>
          <button class="primary-button" @click="saveCard"><Save />保存卡片</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import {
  Boxes,
  CheckCircle2,
  Download,
  FolderDown,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Plus,
  Save,
  Settings,
  Tags,
  Upload,
  UploadCloud,
  X
} from '@lucide/vue';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

const monetColors = ['#d8e8e2', '#eadfd2', '#d7ddea', '#e8d9dd', '#dce6cf', '#d6e3ea', '#e7e0c9', '#d9d2e7'];
const accentColors = ['#7d8fd7', '#8eb7a4', '#d0a49b', '#bfa6d9', '#d7bc76', '#8fb7c8', '#c6b4a4'];

const loading = ref(true);
const busy = ref(false);
const error = ref('');
const user = ref(null);
const config = ref(null);
const view = ref('cards');
const verified = ref(false);
const message = ref('');
const laneName = ref('');
const activeQbId = ref('');
const editingCard = ref(null);
const editingQb = ref(null);
const coverMode = ref('monet');
const tagInput = ref('');
const uploadingCardId = ref('');
const fileInputs = reactive({});
const editQbMessage = ref('');
const editingLaneId = ref('');
const editingLaneName = ref('');
const committingLaneEdit = ref(false);
const draggingLaneId = ref('');
const laneInputs = reactive({});
const backupFileInput = ref(null);
const backupBusy = ref(false);
const backupMessage = ref('');
const backupOk = ref(false);

const loginForm = reactive({ username: '', password: '' });
const credentialForm = reactive({ username: '', password: '' });
const qbForm = reactive({ alias: '', protocol: 'http', host: '', port: '8080', username: '', password: '' });

onMounted(async () => {
  try {
    const response = await api('/api/config');
    config.value = response;
    user.value = { username: response.username };
  } catch {}
  loading.value = false;
});

watch(config, (next) => {
  if (!next) return;
  credentialForm.username = next.username;
  if (!activeQbId.value && next.qbittorrents[0]) activeQbId.value = next.qbittorrents[0].id;
}, { immediate: true });

watch(editingCard, (next) => {
  coverMode.value = next?.cover?.type || 'monet';
  tagInput.value = '';
});

const activeQb = computed(() => config.value?.qbittorrents.find((item) => item.id === activeQbId.value) || config.value?.qbittorrents[0]);
const activeLanes = computed(() => config.value?.lanes.filter((lane) => lane.qbId === activeQb.value?.id) || []);
const tagHints = computed(() => (config.value?.tagPool || []).filter((tag) => !editingCard.value?.tags.includes(tag)));
const imageUrlValue = computed(() => {
  const value = editingCard.value?.cover?.value || '';
  return value.startsWith('data:') ? '' : value;
});

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers }, ...options });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || '请求失败');
  return data;
}

async function login() {
  busy.value = true;
  error.value = '';
  try {
    const response = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(loginForm) });
    user.value = response.user;
    config.value = response.config;
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    busy.value = false;
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  user.value = null;
  config.value = null;
}

async function saveCredentials() {
  if (!credentialForm.username || !credentialForm.password) return;
  await api('/api/auth/credentials', { method: 'PUT', body: JSON.stringify(credentialForm) });
  config.value = { ...config.value, username: credentialForm.username };
  credentialForm.password = '';
}

function downloadJSON(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportBackup() {
  backupBusy.value = true;
  backupMessage.value = '';
  backupOk.value = false;
  try {
    const backup = await api('/api/config/backup');
    const date = new Date().toISOString().slice(0, 10);
    downloadJSON(`qbinder-backup-${date}.json`, backup);
    backupOk.value = true;
    backupMessage.value = '已生成备份文件';
  } catch (requestError) {
    backupMessage.value = requestError.message;
  } finally {
    backupBusy.value = false;
  }
}

async function restoreBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  backupBusy.value = true;
  backupMessage.value = '';
  backupOk.value = false;
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!window.confirm('确认用备份覆盖当前 qB 账户、横栏、卡片和标签池？')) return;
    config.value = await api('/api/config/restore', { method: 'POST', body: JSON.stringify(backup) });
    activeQbId.value = config.value.qbittorrents[0]?.id || '';
    backupOk.value = true;
    backupMessage.value = '备份已加载';
  } catch (requestError) {
    backupMessage.value = requestError.message || '备份文件解析失败';
  } finally {
    backupBusy.value = false;
    event.target.value = '';
  }
}

async function testQb() {
  message.value = '';
  verified.value = false;
  try {
    await api('/api/qb/test', { method: 'POST', body: JSON.stringify({ ...qbForm, port: Number(qbForm.port) }) });
    verified.value = true;
    message.value = '连接验证成功';
  } catch (requestError) {
    message.value = `${requestError.message}，可先添加，详细原因见容器日志`;
  }
}

async function addQb() {
  try {
    config.value = await api('/api/qb', { method: 'POST', body: JSON.stringify({ ...qbForm, port: Number(qbForm.port) }) });
    Object.assign(qbForm, { alias: '', protocol: 'http', host: '', port: '8080', username: '', password: '' });
    verified.value = false;
    message.value = '已添加 qB 账户，可稍后编辑并重新验证';
  } catch (requestError) {
    message.value = requestError.message;
  }
}

function editQb(account) {
  editingQb.value = { ...account, password: '', port: String(account.port) };
  editQbMessage.value = '';
}

async function testEditingQb() {
  editQbMessage.value = '';
  try {
    await api('/api/qb/test', { method: 'POST', body: JSON.stringify({ ...editingQb.value, port: Number(editingQb.value.port) }) });
    editQbMessage.value = '连接验证成功';
  } catch (requestError) {
    editQbMessage.value = `${requestError.message}，可先保存，详细原因见容器日志`;
  }
}

async function saveQb() {
  try {
    config.value = await api(`/api/qb/${editingQb.value.id}`, { method: 'PUT', body: JSON.stringify({ ...editingQb.value, port: Number(editingQb.value.port) }) });
    editingQb.value = null;
  } catch (requestError) {
    editQbMessage.value = requestError.message;
  }
}

async function deleteQb(id) {
  config.value = await api(`/api/qb/${id}`, { method: 'DELETE' });
}

async function addLane() {
  if (!activeQb.value || !laneName.value.trim()) return;
  config.value = await api('/api/lanes', { method: 'POST', body: JSON.stringify({ qbId: activeQb.value.id, name: laneName.value.trim() }) });
  laneName.value = '';
}

function editLane(lane) {
  editingLaneId.value = lane.id;
  editingLaneName.value = lane.name;
  nextTick(() => {
    laneInputs[lane.id]?.focus();
    laneInputs[lane.id]?.select();
  });
}

function setLaneInput(id) {
  return (element) => {
    if (element) laneInputs[id] = element;
  };
}

function resetLaneEdit() {
  editingLaneId.value = '';
  editingLaneName.value = '';
  committingLaneEdit.value = false;
}

async function finishLaneEdit(lane) {
  if (committingLaneEdit.value || editingLaneId.value !== lane.id) return;
  committingLaneEdit.value = true;
  const name = editingLaneName.value.trim();
  if (!name) {
    if (window.confirm(`确认删除横栏“${lane.name}”？该横栏下的卡片也会删除。`)) {
      config.value = await api(`/api/lanes/${lane.id}`, { method: 'DELETE' });
    }
    resetLaneEdit();
    return;
  }
  if (name !== lane.name && window.confirm(`确认将横栏“${lane.name}”改名为“${name}”？`)) {
    config.value = await api(`/api/lanes/${lane.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
  }
  resetLaneEdit();
}

function startLaneDrag(id, event) {
  draggingLaneId.value = id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', id);
}

async function dropLane(targetIndex) {
  if (!draggingLaneId.value) return;
  const sourceId = draggingLaneId.value;
  const sourceIndex = activeLanes.value.findIndex((lane) => lane.id === sourceId);
  draggingLaneId.value = '';
  if (sourceIndex < 0 || sourceIndex === targetIndex) return;
  config.value = await api(`/api/lanes/${sourceId}`, { method: 'PUT', body: JSON.stringify({ targetIndex }) });
}

async function createCard(laneId) {
  const next = await api('/api/cards', { method: 'POST', body: JSON.stringify({ qbId: activeQb.value.id, laneId, name: '新卡片', tags: [], cover: { type: 'monet', value: '' } }) });
  config.value = next;
  editingCard.value = cloneCard(next.cards[next.cards.length - 1]);
}

function cardsForLane(laneId) {
  return config.value?.cards.filter((card) => card.laneId === laneId) || [];
}

function cloneCard(card) {
  return JSON.parse(JSON.stringify(card));
}

function setFileInput(id) {
  return (element) => {
    if (element) fileInputs[id] = element;
  };
}

async function uploadFiles(card, event) {
  const files = [...event.target.files];
  if (!files.length) return;
  const form = new FormData();
  files.forEach((file) => form.append('torrents', file));
  uploadingCardId.value = card.id;
  try {
    await api(`/api/cards/${card.id}/upload`, { method: 'POST', body: form });
  } finally {
    uploadingCardId.value = '';
    event.target.value = '';
  }
}

function addTag(value) {
  const next = value.trim();
  if (!next || editingCard.value.tags.includes(next)) return;
  editingCard.value.tags.push(next);
  tagInput.value = '';
}

function removeTag(tag) {
  editingCard.value.tags = editingCard.value.tags.filter((item) => item !== tag);
}

async function deletePoolTag(tag) {
  if (!window.confirm(`确认从标签池删除“${tag}”？`)) return;
  config.value = await api(`/api/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
}

function setImageUrl(event) {
  editingCard.value.cover = { type: 'image', value: event.target.value };
}

function loadLocalCover(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    editingCard.value.cover = { type: 'image', value: reader.result };
  };
  reader.readAsDataURL(file);
}

async function saveCard() {
  const payload = { ...editingCard.value, cover: coverMode.value === 'monet' ? { type: 'monet', value: '' } : editingCard.value.cover };
  config.value = await api(`/api/cards/${editingCard.value.id}`, { method: 'PUT', body: JSON.stringify(payload) });
  editingCard.value = null;
}

async function deleteCard() {
  if (!window.confirm(`确认删除卡片“${editingCard.value.name}”？`)) return;
  config.value = await api(`/api/cards/${editingCard.value.id}`, { method: 'DELETE' });
  editingCard.value = null;
}

function accountStatus(account) {
  return account.lastVerifiedAt ? '已验证' : '未验证';
}

function pickColor(seed, palette = monetColors) {
  let hash = 0;
  const value = String(seed || 'qbinder');
  for (let index = 0; index < value.length; index += 1) hash = value.charCodeAt(index) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function coverStyle(card) {
  if (card.cover?.type === 'image' && card.cover.value) {
    return { backgroundImage: `linear-gradient(rgba(30,32,42,.12), rgba(30,32,42,.38)), url(${card.cover.value})` };
  }
  return { background: `linear-gradient(135deg, ${pickColor(card.id)}, ${pickColor(card.name, accentColors)})` };
}
</script>
