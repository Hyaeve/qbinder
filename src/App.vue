<template>
  <div v-if="loading" class="loading-screen"><Loader2 class="spin" />qBinder</div>

  <main v-else-if="!user || !config" class="login-page">
    <section class="login-panel">
      <div class="brand-lockup big">
        <img src="/reference.png" alt="qBinder" />
        <div>
          <strong>qBinder</strong>
          <p class="brand-note">qB的种子快捷分类添加助手。</p>
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

  <div v-else class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="brand-lockup">
          <img src="/reference.png" alt="qBinder" />
          <div><strong>qBinder</strong><span>v1.0</span></div>
        </div>
      </div>
      <nav>
        <button :class="{ active: view === 'cards' }" title="卡片" @click="view = 'cards'"><Boxes /><span>卡片</span></button>
        <button :class="{ active: view === 'tasks' }" title="视图" @click="view = 'tasks'"><Table2 /><span>视图</span></button>
        <button :class="{ active: view === 'settings' }" title="设置" @click="view = 'settings'"><Settings /><span>设置</span></button>
      </nav>
      <button class="ghost-button logout" title="退出" @click="logout"><LogOut /><span>退出</span></button>
      <button class="sidebar-toggle" :class="{ 'is-expand-action': sidebarCollapsed }" :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" @click="toggleSidebar">
        <span class="sidebar-toggle-mark" aria-hidden="true"></span>
        <PanelLeftOpen v-if="sidebarCollapsed" /><PanelLeftClose v-else />
      </button>
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

        <section class="setting-panel tracker-mapping-panel">
          <h2><Table2 />Tracker 展示名称</h2>
          <p class="setting-note">关键词匹配 Tracker 域名或地址，优先展示自定义站点名称。</p>
          <div class="tracker-mapping-list">
            <div v-for="(mapping, index) in trackerMappings" :key="`${mapping.keyword}-${index}`" class="tracker-mapping-row">
              <input v-model="mapping.keyword" placeholder="域名或关键词，例如 m-team" aria-label="Tracker 域名关键词" />
              <input v-model="mapping.name" placeholder="展示名称，例如 M-Team" aria-label="Tracker 展示名称" />
              <button type="button" class="icon-button" title="删除映射" aria-label="删除映射" @click="removeTrackerMapping(index)"><X /></button>
            </div>
          </div>
          <div class="button-row">
            <button type="button" class="secondary-button" @click="addTrackerMapping"><Plus />新增映射</button>
            <button type="button" class="primary-button" @click="saveTrackerMappings"><Save />保存映射</button>
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
            <em v-if="account.lastVerifiedAt">已验证</em>
          </div>
          <div class="account-actions">
            <button class="secondary-button" @click="editQb(account)">编辑</button>
            <button class="danger-button" @click="deleteQb(account.id)">删除</button>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="view === 'tasks'" class="content tasks-page" @click="closeTaskPopovers">
      <div v-if="config.qbittorrents.length === 0" class="empty-workspace">
        <img src="/reference.png" alt="qBinder" />
        <h1>先添加 qBittorrent 账户</h1>
        <p>配置 qBittorrent Web UI 连接后，即可在这里查看种子任务。</p>
      </div>

      <template v-else>
        <header class="task-toolbar" @click.stop>
          <div class="account-switcher">
            <button class="account-switcher-trigger" :aria-expanded="accountMenuOpen" aria-haspopup="listbox" @click="accountMenuOpen = !accountMenuOpen">
              <span>{{ activeQb?.alias }}</span><ChevronDown />
            </button>
            <div v-if="accountMenuOpen" class="account-switcher-menu" role="listbox">
              <button v-for="account in config.qbittorrents" :key="account.id" :class="{ active: account.id === activeQb?.id }" role="option" :aria-selected="account.id === activeQb?.id" @click="selectQbAccount(account.id)">{{ account.alias }}</button>
            </div>
          </div>
          <div class="task-toolbar-actions">
            <label class="task-search"><Search /><input v-model="taskSearch" placeholder="搜索种子名称、标签或路径" /></label>
            <button class="icon-button" title="筛选任务" aria-label="筛选任务" :class="{ selected: hasTaskFilters }" @click="filterOpen = !filterOpen"><Filter /></button>
            <button class="icon-button" title="刷新任务" aria-label="刷新任务" :disabled="tasksLoading" @click="loadTasks"><RefreshCw :class="{ spin: tasksLoading }" /></button>
          </div>
          <section v-if="filterOpen" class="task-filter-popover">
            <div class="filter-heading"><strong>筛选器</strong><button @click="clearTaskFilters">全部选择</button></div>
            <div class="filter-group">
              <strong>状态</strong>
              <label v-for="item in statusOptions" :key="item.key"><input v-model="taskFilters.status" type="checkbox" :value="item.key" />{{ item.label }}</label>
            </div>
            <div v-for="group in taskFilterGroups" :key="group.key" class="filter-group">
              <strong>{{ group.label }}</strong>
              <label v-for="item in group.values" :key="item"><input v-model="taskFilters[group.key]" type="checkbox" :value="item" />{{ item }}</label>
              <span v-if="!group.values.length" class="filter-none">暂无可筛选项</span>
            </div>
          </section>
        </header>

        <p v-if="tasksError" class="form-error task-error">{{ tasksError }}</p>
        <section class="task-table-shell" @click.stop>
          <div class="task-table" :style="taskGridStyle">
            <div class="task-table-header">
              <div v-for="column in visibleTaskColumns" :key="column.key" class="task-header-cell" @click="sortTasks(column.key)" @contextmenu.prevent="openColumnMenu(column, $event)">
                <span>{{ column.label }}</span><ArrowUp v-if="taskSort.key === column.key && taskSort.direction === 'asc'" /><ArrowDown v-else-if="taskSort.key === column.key" />
                <i class="column-resizer" @pointerdown.stop="startColumnResize(column, $event)"></i>
              </div>
            </div>
            <div v-for="task in pagedTasks" :key="task.hash" class="task-row">
              <div v-for="column in visibleTaskColumns" :key="`${task.hash}-${column.key}`" class="task-cell" :class="`task-cell-${column.key}`">
                <template v-if="column.key === 'progress'"><div class="progress-value"><div><span :style="{ width: `${Math.round(task.progress * 100)}%` }"></span></div><b>{{ formatProgress(task.progress) }}</b></div></template>
                <template v-else-if="column.key === 'tags'"><div class="task-tags"><span v-for="tag in taskTags(task)" :key="tag" :style="{ background: pickColor(tag) }">{{ tag }}</span><em v-if="!taskTags(task).length">—</em></div></template>
                <template v-else-if="column.key === 'name'"><span class="task-cell-text" @mouseenter="scheduleTaskNameTooltip(task, $event)" @mouseleave="hideTaskNameTooltip">{{ formatTaskValue(task, column.key) }}</span></template>
                <template v-else><span class="task-cell-text" :title="taskCellTitle(task, column.key)">{{ formatTaskValue(task, column.key) }}</span></template>
              </div>
            </div>
          </div>
          <div v-if="tasksLoading" class="task-table-loading"><Loader2 class="spin" />正在同步任务…</div>
          <div v-else-if="!filteredTasks.length" class="task-table-empty">{{ tasks.length ? '没有符合当前筛选条件的任务。' : '此 qBittorrent 账户暂时没有种子任务。' }}</div>
        </section>
        <div v-if="taskNameTooltip.visible" class="task-name-tooltip" :style="{ left: `${taskNameTooltip.x}px`, top: `${taskNameTooltip.y}px` }">{{ taskNameTooltip.text }}</div>
        <footer class="task-summary" aria-label="传输状态">
          <span class="task-summary-count">显示第 {{ taskRangeStart }}–{{ taskRangeEnd }} 个，共 {{ filteredTasks.length }} / {{ tasks.length }} 个任务</span>
          <strong class="transfer-stat is-download"><Download /><span>下载</span><b>{{ formatSpeed(taskTotals.down) }}</b></strong>
          <strong class="transfer-stat is-upload"><Upload /><span>上传</span><b>{{ formatSpeed(taskTotals.up) }}</b></strong>
        </footer>
        <nav v-if="taskPageCount > 1" class="task-pagination" aria-label="任务分页">
          <button :disabled="taskPage === 1" @click="goToTaskPage(taskPage - 1)">上一页</button>
          <span>第 {{ taskPage }} / {{ taskPageCount }} 页 · 每页 100 个</span>
          <button :disabled="taskPage === taskPageCount" @click="goToTaskPage(taskPage + 1)">下一页</button>
        </nav>

        <div v-if="columnMenu" class="column-menu" :style="{ left: `${columnMenu.x}px`, top: `${columnMenu.y}px` }" @click.stop>
          <strong>{{ columnMenu.column.label }}列</strong>
          <button :disabled="columnMenu.column.locked" @click="toggleTaskColumn(columnMenu.column.key)">{{ columnMenu.column.hidden ? '显示此列' : '隐藏此列' }}</button>
          <button :disabled="columnMenu.column.locked || !canMoveColumn(columnMenu.column.key, -1)" @click="moveTaskColumn(columnMenu.column.key, -1)">向左移动</button>
          <button :disabled="columnMenu.column.locked || !canMoveColumn(columnMenu.column.key, 1)" @click="moveTaskColumn(columnMenu.column.key, 1)">向右移动</button>
          <div class="column-menu-divider"></div>
          <span>显示列</span>
          <label v-for="column in taskColumns" :key="column.key"><input type="checkbox" :checked="!column.hidden" :disabled="column.locked" @change="toggleTaskColumn(column.key)" />{{ column.label }}</label>
        </div>
      </template>
    </div>

    <div v-else class="content cards-page" @click="accountMenuOpen = false">
      <div v-if="config.qbittorrents.length === 0" class="empty-workspace">
        <img src="/reference.png" alt="qBinder" />
        <h1>先添加 qBittorrent 账户</h1>
        <p>进入设置页面添加并验证连接后，就可以为不同 qB 账户创建卡片。</p>
      </div>

      <template v-else>
        <header class="top-tabs" @click.stop>
          <div class="account-switcher">
            <button class="account-switcher-trigger" :aria-expanded="accountMenuOpen" aria-haspopup="listbox" @click="accountMenuOpen = !accountMenuOpen">
              <span>{{ activeQb?.alias }}</span><ChevronDown />
            </button>
            <div v-if="accountMenuOpen" class="account-switcher-menu" role="listbox">
              <button v-for="account in config.qbittorrents" :key="account.id" :class="{ active: account.id === activeQb?.id }" role="option" :aria-selected="account.id === activeQb?.id" @click="selectQbAccount(account.id)">{{ account.alias }}</button>
            </div>
          </div>
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
  Table2,
  Search,
  Filter,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Tags,
  Upload,
  UploadCloud,
  X
} from '@lucide/vue';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

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
const tasks = ref([]);
const taskPage = ref(1);
const taskPageSize = 100;
const tasksLoading = ref(false);
const tasksError = ref('');
const taskSearch = ref('');
const filterOpen = ref(false);
const columnMenu = ref(null);
const accountMenuOpen = ref(false);
const taskSort = reactive({ key: 'name', direction: 'asc' });
const taskFilters = reactive({ status: [], path: [], tags: [], tracker: [] });
const taskColumns = reactive(loadTaskColumns());
const trackerMappings = ref([]);
const taskNameTooltip = reactive({ visible: false, text: '', x: 0, y: 0 });
let taskNameTooltipTimer = null;
let taskRefreshTimer = null;
const sidebarCollapsed = ref(localStorage.getItem('qbinder-sidebar-collapsed') === 'true');

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
  trackerMappings.value = cloneTrackerMappings(next.trackerMappings);
  if (!activeQbId.value && next.qbittorrents[0]) activeQbId.value = next.qbittorrents[0].id;
}, { immediate: true });

watch(view, (next) => {
  if (next === 'tasks') {
    loadTasks();
    startTaskRefresh();
  } else {
    stopTaskRefresh();
    closeTaskPopovers();
  }
});

watch(activeQbId, () => {
  if (view.value === 'tasks') loadTasks();
});

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

const visibleTaskColumns = computed(() => taskColumns.filter((column) => !column.hidden));
const taskGridStyle = computed(() => ({ '--task-columns': visibleTaskColumns.value.map((column) => `${column.width}px`).join(' ') }));
const statusOptions = [
  { key: 'downloading', label: '下载' }, { key: 'seeding', label: '做种' }, { key: 'completed', label: '完成' },
  { key: 'running', label: '正运行' }, { key: 'stopped', label: '已停止' }, { key: 'error', label: '错误' }
];
const taskFilterGroups = computed(() => [
  { key: 'path', label: '保存路径', values: uniqueTaskValues((task) => task.save_path) },
  { key: 'tags', label: '标签', values: [...new Set(tasks.value.flatMap(taskTags))].sort((a, b) => a.localeCompare(b, 'zh-CN')) },
  { key: 'tracker', label: 'Tracker', values: uniqueTaskValues((task) => trackerDisplayName(task.tracker)) }
]);
const hasTaskFilters = computed(() => Object.values(taskFilters).some((items) => items.length));
const filteredTasks = computed(() => {
  const query = taskSearch.value.trim().toLocaleLowerCase();
  const result = tasks.value.filter((task) => {
    const matchesSearch = !query || [task.name, task.tags, task.save_path, trackerDisplayName(task.tracker)].some((value) => String(value || '').toLocaleLowerCase().includes(query));
    const matchesStatus = !taskFilters.status.length || taskFilters.status.some((status) => taskMatchesStatus(task, status));
    const matchesPath = !taskFilters.path.length || taskFilters.path.includes(task.save_path);
    const matchesTags = !taskFilters.tags.length || taskTags(task).some((tag) => taskFilters.tags.includes(tag));
    const tracker = trackerDisplayName(task.tracker);
    const matchesTracker = !taskFilters.tracker.length || taskFilters.tracker.includes(tracker);
    return matchesSearch && matchesStatus && matchesPath && matchesTags && matchesTracker;
  });
  return result.sort((left, right) => compareTasks(left, right, taskSort.key, taskSort.direction));
});
const taskPageCount = computed(() => Math.max(1, Math.ceil(filteredTasks.value.length / taskPageSize)));
const pagedTasks = computed(() => {
  const start = (taskPage.value - 1) * taskPageSize;
  return filteredTasks.value.slice(start, start + taskPageSize);
});
const taskRangeStart = computed(() => filteredTasks.value.length ? (taskPage.value - 1) * taskPageSize + 1 : 0);
const taskRangeEnd = computed(() => Math.min(taskPage.value * taskPageSize, filteredTasks.value.length));
const taskTotals = computed(() => filteredTasks.value.reduce((totals, task) => ({ down: totals.down + task.dlspeed, up: totals.up + task.upspeed }), { down: 0, up: 0 }));

watch([taskSearch, () => taskFilters.status, () => taskFilters.path, () => taskFilters.tags, () => taskFilters.tracker, () => taskSort.key, () => taskSort.direction], () => {
  taskPage.value = 1;
}, { deep: true });

watch(taskPageCount, (count) => {
  if (taskPage.value > count) taskPage.value = count;
});

function goToTaskPage(page) {
  taskPage.value = Math.min(Math.max(page, 1), taskPageCount.value);
}

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
  if (file.size > 1024 * 1024) {
    backupMessage.value = '备份文件不能超过 1 MB';
    backupOk.value = false;
    event.target.value = '';
    return;
  }
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

function cloneTrackerMappings(mappings) {
  return Array.isArray(mappings) ? mappings.map((mapping) => ({ keyword: mapping.keyword || '', name: mapping.name || '' })) : [];
}

function addTrackerMapping() {
  trackerMappings.value.push({ keyword: '', name: '' });
}

function removeTrackerMapping(index) {
  trackerMappings.value.splice(index, 1);
}

async function saveTrackerMappings() {
  try {
    config.value = await api('/api/tracker-mappings', { method: 'PUT', body: JSON.stringify(trackerMappings.value) });
  } catch (requestError) {
    window.alert(requestError.message);
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
    const added = config.value.qbittorrents.at(-1);
    message.value = added?.lastVerifiedAt ? '已添加 qB 账户，连接验证成功' : '已添加 qB 账户，连接未验证，详细原因见容器日志';
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
  const maxUploadSize = 32 * 1024 * 1024;
  if (!files.length) return;
  if (files.length > 50 || files.some((file) => !file.name.toLowerCase().endsWith('.torrent')) || files.reduce((total, file) => total + file.size, 0) > maxUploadSize) {
    window.alert('仅支持最多 50 个 .torrent 文件，总大小不能超过 32 MB。');
    event.target.value = '';
    return;
  }
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
  if (file.size > 512 * 1024) {
    window.alert('封面图片不能超过 512 KB。');
    event.target.value = '';
    return;
  }
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

function loadTaskColumns() {
  const defaults = [
    { key: 'name', label: '名称', width: 280, locked: true },
    { key: 'size', label: '大小', width: 110, locked: true },
    { key: 'progress', label: '进度', width: 190 },
    { key: 'seeders', label: '做种用户', width: 96 },
    { key: 'leechers', label: '下载用户', width: 96 },
    { key: 'dlspeed', label: '下载速度', width: 118 },
    { key: 'upspeed', label: '上传速度', width: 118 },
    { key: 'tags', label: '标签', width: 150 },
    { key: 'added_on', label: '添加时间', width: 166 },
    { key: 'tracker', label: 'Tracker', width: 210 },
    { key: 'save_path', label: '保存路径', width: 230 }
  ];
  try {
    const saved = JSON.parse(localStorage.getItem('qbinder-task-columns') || '[]');
    if (!Array.isArray(saved)) return defaults;
    const byKey = new Map(saved.map((column) => [column.key, column]));
    const ordered = saved.map((column) => defaults.find((item) => item.key === column.key)).filter(Boolean).map((base) => ({ ...base, width: clampWidth(byKey.get(base.key)?.width, base.width), hidden: base.locked ? false : Boolean(byKey.get(base.key)?.hidden) }));
    defaults.filter((column) => !byKey.has(column.key)).forEach((column) => ordered.push({ ...column }));
    const pinned = defaults.slice(0, 2).map((column) => ordered.find((item) => item.key === column.key));
    return [...pinned, ...ordered.filter((column) => !column.locked)];
  } catch {
    return defaults;
  }
}

function persistTaskColumns() {
  localStorage.setItem('qbinder-task-columns', JSON.stringify(taskColumns.map(({ key, width, hidden }) => ({ key, width, hidden }))));
}

function clampWidth(value, fallback) {
  const width = Number(value);
  return Number.isFinite(width) ? Math.max(80, Math.min(480, width)) : fallback;
}

async function loadTasks() {
  if (!activeQb.value || tasksLoading.value) return;
  tasksLoading.value = true;
  tasksError.value = '';
  try {
    const result = await api(`/api/qb/${activeQb.value.id}/torrents`);
    tasks.value = Array.isArray(result.tasks) ? result.tasks : [];
  } catch (requestError) {
    tasksError.value = requestError.message;
  } finally {
    tasksLoading.value = false;
  }
}

function scheduleTaskNameTooltip(task, event) {
  const target = event.currentTarget;
  if (target.scrollWidth <= target.clientWidth) return;
  window.clearTimeout(taskNameTooltipTimer);
  const bounds = target.getBoundingClientRect();
  taskNameTooltipTimer = window.setTimeout(() => {
    taskNameTooltip.text = task.name || '—';
    taskNameTooltip.x = Math.min(bounds.left, window.innerWidth - 360);
    taskNameTooltip.y = Math.min(bounds.bottom + 8, window.innerHeight - 72);
    taskNameTooltip.visible = true;
  }, 1000);
}

function hideTaskNameTooltip() {
  window.clearTimeout(taskNameTooltipTimer);
  taskNameTooltip.visible = false;
}

function startTaskRefresh() {
  stopTaskRefresh();
  taskRefreshTimer = window.setInterval(() => {
    if (view.value === 'tasks' && document.visibilityState === 'visible') loadTasks();
  }, 10000);
}

function stopTaskRefresh() {
  if (taskRefreshTimer) window.clearInterval(taskRefreshTimer);
  taskRefreshTimer = null;
}

function uniqueTaskValues(getter) {
  return [...new Set(tasks.value.map(getter).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'));
}

function taskTags(task) {
  return String(task.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
}

function taskMatchesStatus(task, category) {
  const state = String(task.state || '').toLowerCase();
  if (category === 'completed') return task.progress >= 1;
  if (category === 'error') return state.includes('error') || state.includes('missing');
  if (category === 'stopped') return state.includes('paused');
  if (category === 'downloading') return /dl|downloading/.test(state) && !state.includes('paused');
  if (category === 'seeding') return /up|uploading/.test(state) && !state.includes('paused');
  return !state.includes('paused') && !state.includes('error') && !state.includes('missing');
}

function compareTasks(left, right, key, direction) {
  const valueKey = { seeders: 'num_seeds', leechers: 'num_leechs' }[key] || key;
  const leftValue = key === 'tags' ? taskTags(left).join(',') : key === 'tracker' ? trackerDisplayName(left.tracker) : left[valueKey];
  const rightValue = key === 'tags' ? taskTags(right).join(',') : key === 'tracker' ? trackerDisplayName(right.tracker) : right[valueKey];
  const numeric = ['size', 'progress', 'seeders', 'leechers', 'dlspeed', 'upspeed', 'added_on'].includes(key);
  const compared = numeric ? Number(leftValue || 0) - Number(rightValue || 0) : String(leftValue || '').localeCompare(String(rightValue || ''), 'zh-CN', { numeric: true });
  return direction === 'asc' ? compared : -compared;
}

function sortTasks(key) {
  if (taskSort.key === key) taskSort.direction = taskSort.direction === 'asc' ? 'desc' : 'asc';
  else Object.assign(taskSort, { key, direction: 'asc' });
}

function formatBytes(value) {
  const amount = Number(value || 0);
  if (!amount) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(amount) / Math.log(1024)), units.length - 1);
  return `${(amount / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatSpeed(value) {
  return `${formatBytes(value)}/s`;
}

function formatProgress(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function trackerDisplayName(tracker) {
  const value = String(tracker || '').trim();
  if (!value) return '无 Tracker';
  const normalized = value.toLocaleLowerCase();
  const mapping = (config.value?.trackerMappings || []).find((item) => item.keyword && normalized.includes(String(item.keyword).trim().toLocaleLowerCase()));
  if (mapping?.name?.trim()) return mapping.name.trim();
  try {
    const hostname = new URL(value).hostname.replace(/^tracker\./i, '').replace(/^www\./i, '');
    return hostname || value;
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0].replace(/^tracker\./i, '') || value;
  }
}

function formatTaskValue(task, key) {
  switch (key) {
    case 'size': return formatBytes(task.size);
    case 'seeders': return task.num_seeds ?? 0;
    case 'leechers': return task.num_leechs ?? 0;
    case 'dlspeed': return formatSpeed(task.dlspeed);
    case 'upspeed': return formatSpeed(task.upspeed);
    case 'added_on': return task.added_on ? new Date(task.added_on * 1000).toLocaleString('zh-CN', { hour12: false }) : '—';
    case 'tracker': return trackerDisplayName(task.tracker);
    case 'save_path': return task.save_path || '—';
    default: return task[key] || '—';
  }
}

function taskCellTitle(task, key) {
  return ['name', 'tracker', 'save_path'].includes(key) ? formatTaskValue(task, key) : '';
}

function clearTaskFilters() {
  Object.keys(taskFilters).forEach((key) => { taskFilters[key] = []; });
}

function closeTaskPopovers() {
  filterOpen.value = false;
  columnMenu.value = null;
  accountMenuOpen.value = false;
}

function selectQbAccount(id) {
  activeQbId.value = id;
  accountMenuOpen.value = false;
}

function openColumnMenu(column, event) {
  filterOpen.value = false;
  columnMenu.value = { column, x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 260) };
}

function toggleTaskColumn(key) {
  const column = taskColumns.find((item) => item.key === key);
  if (!column || column.locked) return;
  column.hidden = !column.hidden;
  persistTaskColumns();
}

function canMoveColumn(key, direction) {
  const index = taskColumns.findIndex((item) => item.key === key);
  const target = index + direction;
  return index >= 2 && target >= 2 && target < taskColumns.length;
}

function moveTaskColumn(key, direction) {
  if (!canMoveColumn(key, direction)) return;
  const index = taskColumns.findIndex((item) => item.key === key);
  const [column] = taskColumns.splice(index, 1);
  taskColumns.splice(index + direction, 0, column);
  persistTaskColumns();
}

function startColumnResize(column, event) {
  const startX = event.clientX;
  const startWidth = column.width;
  const resize = (moveEvent) => { column.width = clampWidth(startWidth + moveEvent.clientX - startX, startWidth); };
  const finish = () => { window.removeEventListener('pointermove', resize); window.removeEventListener('pointerup', finish); persistTaskColumns(); };
  window.addEventListener('pointermove', resize);
  window.addEventListener('pointerup', finish);
}

onUnmounted(stopTaskRefresh);

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem('qbinder-sidebar-collapsed', String(sidebarCollapsed.value));
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
