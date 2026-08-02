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
        <button :class="{ active: view === 'cards' }" title="卡片" @click="navigateToView('cards')"><Boxes /><span>卡片</span></button>
        <button :class="{ active: view === 'torrents' }" title="视图" @click="navigateToView('torrents')"><Table2 /><span>视图</span></button>
        <button :class="{ active: view === 'tasks' }" title="任务" @click="navigateToView('tasks')"><Gauge /><span>任务</span></button>
        <button :class="{ active: view === 'settings' }" title="设置" @click="navigateToView('settings')"><Settings /><span>设置</span></button>
      </nav>
      <button class="ghost-button logout" title="退出" @click="logout"><LogOut /><span>退出</span></button>
      <button class="sidebar-toggle" :class="{ 'is-expand-action': sidebarCollapsed }" :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" @click="toggleSidebar">
        <span class="sidebar-toggle-rail" aria-hidden="true"></span>
        <span class="sidebar-toggle-action" aria-hidden="true">
          <svg viewBox="0 0 24 120" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.25">
            <defs>
              <linearGradient id="sidebar-monet-fold" x1="4" y1="0" x2="20" y2="120" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#69b9dd"><animate attributeName="stop-color" values="#69b9dd;#9ac9b4;#c59ab9;#69b9dd" dur="4s" repeatCount="indefinite" /></stop>
                <stop offset=".48" stop-color="#9ac9b4"><animate attributeName="stop-color" values="#9ac9b4;#c59ab9;#69b9dd;#9ac9b4" dur="4s" repeatCount="indefinite" /></stop>
                <stop offset="1" stop-color="#c59ab9"><animate attributeName="stop-color" values="#c59ab9;#69b9dd;#9ac9b4;#c59ab9" dur="4s" repeatCount="indefinite" /></stop>
              </linearGradient>
            </defs>
            <polyline class="sidebar-toggle-fold sidebar-toggle-fold-collapse" points="17 2 7 60 17 118" stroke="url(#sidebar-monet-fold)" />
            <polyline class="sidebar-toggle-fold sidebar-toggle-fold-expand" points="7 2 17 60 7 118" stroke="url(#sidebar-monet-fold)" />
          </svg>
        </span>
      </button>
    </aside>

    <div v-if="view === 'settings'" class="content settings-page">
      <section class="settings-grid">
        <div class="settings-column settings-column-left">
          <form class="setting-panel" @submit.prevent="saveCredentials">
            <h2><KeyRound />登录账号</h2>
            <label>账号<input v-model="credentialForm.username" /></label>
            <label>新密码<input v-model="credentialForm.password" type="password" /></label>
            <button class="primary-button"><Save />保存</button>
          </form>

          <section class="setting-panel tracker-mapping-panel">
            <h2><Table2 />Tracker 展示名称</h2>
            <p class="setting-note">关键词匹配 Tracker 域名或地址，优先展示自定义站点名称。</p>
            <div class="tracker-mapping-list">
              <div v-for="(mapping, index) in trackerMappings" :key="`${mapping.keyword}-${index}`" class="tracker-mapping-row">
                <input v-model="mapping.keyword" placeholder="关键词" aria-label="Tracker 域名关键词" />
                <input v-model="mapping.name" placeholder="展示名称" aria-label="Tracker 展示名称" />
                <button type="button" class="icon-button" title="删除映射" aria-label="删除映射" @click="removeTrackerMapping(index)"><X /></button>
              </div>
            </div>
            <div class="button-row">
              <button type="button" class="secondary-button" @click="addTrackerMapping"><Plus />新增映射</button>
              <button type="button" class="primary-button" @click="saveTrackerMappings"><Save />保存映射</button>
            </div>
          </section>
        </div>

        <div class="settings-column settings-column-right">
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
            <section class="configured-qb-accounts" aria-label="已配置 qB 账户">
              <div class="configured-qb-heading">
                <h3>已配置 qB 账户</h3>
                <span>{{ config.qbittorrents.length }} 个账户</span>
              </div>
              <div class="configured-qb-scroller" @wheel.prevent="scrollQbAccounts">
                <article v-for="account in config.qbittorrents" :key="account.id" class="configured-qb-card">
                  <div class="configured-qb-card-main">
                    <Layers />
                    <strong :title="account.alias">{{ account.alias }}</strong>
                    <span :title="`${account.protocol}://${account.host}:${account.port}`">{{ account.protocol }}://{{ account.host }}:{{ account.port }}</span>
                  </div>
                  <div class="configured-qb-actions">
                    <button type="button" class="secondary-button" @click="editQb(account)">编辑</button>
                    <button type="button" class="danger-button" @click="deleteQb(account.id)">删除</button>
                  </div>
                </article>
                <div class="configured-qb-empty">
                  <Plus />
                  <span>{{ config.qbittorrents.length ? '预留账户窗口' : '添加后的 qBittorrent 账户将显示在这里。' }}</span>
                </div>
              </div>
            </section>
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
              <button type="button" class="secondary-button" :disabled="backupBusy" @click="exportBackup"><Download />备份配置</button>
              <button type="button" class="primary-button" :disabled="backupBusy" @click="backupFileInput?.click()"><Upload />加载备份</button>
            </div>
          </section>
        </div>
      </section>

    </div>

    <div v-else-if="view === 'tasks'" class="content schedule-page">
      <div v-if="config.qbittorrents.length === 0" class="empty-workspace">
        <img src="/reference.png" alt="qBinder" /><h1>先添加 qBittorrent 账户</h1><p>添加连接后，即可创建定时任务。</p>
      </div>
      <template v-else>
        <header class="schedule-header">
          <div><p class="eyebrow">AUTOMATION</p><h1>定时任务</h1><p>按 Cron 计划，让种子与备用速度在恰当的时间行动。</p></div>
          <button class="primary-button" @click="openScheduleEditor()"><Plus />新建任务</button>
        </header>
        <p v-if="scheduleError" class="form-error">{{ scheduleError }}</p>
        <section v-if="schedules.length" class="schedule-list">
          <article v-for="schedule in schedules" :key="schedule.id" class="schedule-card" :class="{ disabled: !schedule.enabled }">
            <div class="schedule-card-accent"></div>
            <div class="schedule-card-main"><div class="schedule-title"><h2>{{ schedule.name }}</h2><span class="schedule-action">{{ scheduleActionLabel(schedule.action) }}</span></div><p><code>{{ schedule.cron }}</code><span>{{ scheduleTargetLabel(schedule) }}</span></p><small>{{ schedule.lastRunAt ? `上次执行：${formatScheduleDate(schedule.lastRunAt)}` : '尚未执行' }}<em v-if="schedule.lastError"> · {{ schedule.lastError }}</em></small></div>
            <label class="schedule-switch" :title="schedule.enabled ? '停用任务' : '启用任务'"><input type="checkbox" :checked="schedule.enabled" @change="toggleSchedule(schedule)" /><span></span></label>
            <div class="schedule-card-actions"><button class="icon-button" title="编辑" @click="openScheduleEditor(schedule)"><Settings /></button><button class="icon-button danger-icon" title="删除" @click="deleteSchedule(schedule)"><Trash2 /></button></div>
          </article>
        </section>
        <section v-else class="schedule-empty"><Gauge /><h2>还没有定时任务</h2><p>新建任务可定时添加种子、操作已有种子，或切换备用速度。</p><button class="secondary-button" @click="openScheduleEditor()"><Plus />创建第一个任务</button></section>
      </template>
    </div>

    <div v-else-if="view === 'torrents'" class="content tasks-page" @click="closeTaskPopovers">
      <div v-if="config.qbittorrents.length === 0" class="empty-workspace">
        <img src="/reference.png" alt="qBinder" />
        <h1>先添加 qBittorrent 账户</h1>
        <p>配置 qBittorrent Web UI 连接后，即可在这里查看种子任务。</p>
      </div>

      <template v-else>
        <header class="task-toolbar" @click.stop>
          <div class="account-switcher">
            <button class="account-switcher-trigger" :aria-expanded="accountMenuOpen" aria-haspopup="listbox" @click="accountMenuOpen = !accountMenuOpen">
              <span>{{ activeQb?.alias }}</span>
            </button>
            <div v-if="accountMenuOpen" class="account-switcher-menu" role="listbox">
              <button v-for="account in config.qbittorrents" :key="account.id" :class="{ active: account.id === activeQb?.id }" role="option" :aria-selected="account.id === activeQb?.id" @click="selectQbAccount(account.id)">{{ account.alias }}</button>
            </div>
          </div>
          <div class="task-toolbar-actions">
            <label class="task-search"><Search /><input v-model="taskSearch" placeholder="搜索种子名称、标签或路径" /></label>
            <button class="icon-button" title="筛选任务" aria-label="筛选任务" :class="{ selected: hasTaskFilters }" @click="toggleTaskFilter"><Filter /></button>
            <button class="icon-button" title="刷新任务" aria-label="刷新任务" :disabled="tasksLoading" @click="loadTasks"><RefreshCw :class="{ spin: tasksLoading }" /></button>
          </div>
          <section v-if="filterOpen" class="task-filter-popover" aria-label="任务筛选">
            <section class="filter-candidates" aria-label="筛选候选区域">
              <div class="filter-candidates-heading"><strong>筛选候选</strong><span>{{ selectedFilterCandidates.length }} 项</span></div>
              <div v-if="hasFilterCandidates" class="filter-selected">
                <button v-for="item in selectedFilterCandidates" :key="`${item.key}-${item.value}`" :class="`filter-tone-${taskTagTone(`${item.key}-${item.value}`)}`" @click="removeFilterCandidate(item)">
                  <small>{{ item.groupLabel }}</small>{{ item.label }}<X />
                </button>
              </div>
              <p v-else class="filter-candidates-empty">从左侧选择类别，再勾选具体筛选项；同类可多选。</p>
            </section>
            <div class="filter-browser">
              <nav class="filter-category-list" aria-label="一级筛选类别">
                <div class="filter-category-options">
                  <button v-for="group in taskFilterGroups" :key="group.key" :class="{ active: activeFilterGroup === group.key }" @click="selectFilterGroup(group.key)">
                    <span>{{ group.label }}</span><em v-if="filterDraft[group.key].length">{{ filterDraft[group.key].length }}</em>
                  </button>
                </div>
                <div class="filter-confirm-buttons">
                  <button class="secondary-button" @click="clearFilterCandidates">清除</button>
                  <button class="primary-button" @click="applyTaskFilters">确认</button>
                </div>
              </nav>
              <div class="filter-option-panel">
                <div class="filter-option-heading">
                  <div><strong>{{ activeTaskFilterGroup.label }}</strong><span>候选 {{ filterDraft[activeFilterGroup].length }} / {{ activeTaskFilterGroup.values.length }} 项</span></div>
                  <div class="filter-option-heading-actions">
                    <div v-if="pagedFilterValues.length" class="filter-option-actions">
                      <button @click="selectCurrentFilterPage">全选本页</button>
                      <button v-if="filterDraft[activeFilterGroup].length" @click="clearCurrentFilterGroup">清空</button>
                    </div>
                    <div v-if="filterPageCount > 1" class="filter-option-pagination">
                      <button class="filter-page-button" :disabled="filterValuePage === 1" title="上一页" aria-label="上一页" @click="filterValuePage--"><ChevronUp /></button>
                      <span>第 {{ filterValuePage }} / {{ filterPageCount }} 页</span>
                      <button class="filter-page-button" :disabled="filterValuePage === filterPageCount" title="下一页" aria-label="下一页" @click="filterValuePage++"><ChevronDown /></button>
                    </div>
                  </div>
                </div>
                <div v-if="pagedFilterValues.length" class="filter-option-list">
                  <label v-for="item in pagedFilterValues" :key="item" :class="{ checked: filterDraft[activeFilterGroup].includes(item) }">
                    <input v-model="filterDraft[activeFilterGroup]" type="checkbox" :value="item" />
                    <span class="filter-check"><Check /></span>
                    <span class="filter-option-label">{{ filterValueLabel(activeTaskFilterGroup, item) }}</span>
                  </label>
                </div>
                <span v-else class="filter-none">暂无可筛选项目</span>
              </div>
            </div>
          </section>
        </header>

        <p v-if="tasksError" class="form-error task-error">{{ tasksError }}</p>
        <section ref="taskTableShell" class="task-table-shell" @click.capture="closeTaskMenuOnOutsideClick" @click.stop @scroll="syncTaskScrollbar">
          <div class="task-table" :style="taskGridStyle">
            <div class="task-table-header">
              <div v-for="column in visibleTaskColumns" :key="column.key" class="task-header-cell" @click="sortTasks(column.key)" @contextmenu.prevent="openColumnMenu(column, $event)">
                <span>{{ column.label }}</span><ChevronUp v-if="taskSort.key === column.key && taskSort.direction === 'asc'" class="task-sort-icon" /><ChevronDown v-else-if="taskSort.key === column.key" class="task-sort-icon" />
                <i class="column-resizer" @pointerdown.stop="startColumnResize(column, $event)"></i>
              </div>
            </div>
            <div v-for="task in pagedTasks" :key="task.hash" class="task-row" :class="{ selected: selectedTaskHashes.includes(task.hash) }" @mouseenter="hoveredTaskHash = task.hash" @mouseleave="hoveredTaskHash = ''" @click.stop="selectTask(task, $event)" @contextmenu.prevent.stop="openTaskMenu(task, $event)">
              <div v-for="column in visibleTaskColumns" :key="`${task.hash}-${column.key}`" class="task-cell" :class="`task-cell-${column.key}`">
                <template v-if="column.key === 'progress'"><div class="progress-value"><div><span :style="{ width: `${Math.round(task.progress * 100)}%` }"></span><b>{{ formatProgress(task.progress) }}</b></div></div></template>
                <template v-else-if="column.key === 'status'"><span class="task-status" :class="taskStatusClass(task)">{{ taskStatusLabel(task) }}</span></template>
                <template v-else-if="column.key === 'tags'"><div class="task-tags"><span v-for="tag in taskTags(task)" :key="tag" :class="`tag-tone-${taskTagTone(tag)}`">{{ tag }}</span><em v-if="!taskTags(task).length">—</em></div></template>
                <template v-else-if="column.key === 'tracker'"><span class="task-tracker" :class="`tag-tone-${taskTagTone(trackerDisplayName(task.tracker))}`" :title="trackerDisplayName(task.tracker)">{{ trackerDisplayName(task.tracker) }}</span></template>
                <template v-else-if="column.key === 'name'"><span class="task-cell-text" @mouseenter="scheduleTaskNameTooltip(task, $event)" @mouseleave="hideTaskNameTooltip">{{ formatTaskValue(task, column.key) }}</span></template>
                <template v-else><span class="task-cell-text" :title="taskCellTitle(task, column.key)">{{ formatTaskValue(task, column.key) }}</span></template>
              </div>
            </div>
          </div>
          <div v-if="tasksLoading" class="task-table-loading"><Loader2 class="spin" />正在同步任务…</div>
          <div v-else-if="!filteredTasks.length" class="task-table-empty">{{ tasks.length ? '没有符合当前筛选条件的任务。' : '此 qBittorrent 账户暂时没有种子任务。' }}</div>
        </section>
        <div v-if="taskNameTooltip.visible" class="task-name-tooltip" :style="{ left: `${taskNameTooltip.x}px`, top: `${taskNameTooltip.y}px` }">{{ taskNameTooltip.text }}</div>
        <footer class="task-summary" aria-label="qBittorrent 传输状态">
          <div ref="taskHorizontalScrollbar" class="task-horizontal-scrollbar" aria-label="任务列表横向滚动" @scroll="syncTaskTableScroll">
            <div :style="taskScrollbarContentStyle"></div>
          </div>
          <span class="task-summary-count">{{ selectedTaskSummary || (hoveredTaskIndex ? `所选第 ${hoveredTaskIndex} 行，共 ${filteredTasks.length} / ${tasks.length} 个任务` : `显示第 ${taskRangeStart}–${taskRangeEnd} 行，共 ${filteredTasks.length} / ${tasks.length} 个任务`) }}</span>
          <button
            type="button"
            class="transfer-alt-speed-button"
            :class="{ active: transferInfo.altSpeedLimitsOn }"
            :disabled="transferInfo.togglingAltSpeedLimits"
            :title="transferInfo.altSpeedLimitsOn ? '关闭备用速度' : '开启备用速度'"
            :aria-label="transferInfo.altSpeedLimitsOn ? '关闭备用速度' : '开启备用速度'"
            @click="toggleAlternativeSpeedLimits"
          ><svg v-if="transferInfo.altSpeedLimitsOn" class="transfer-alt-speed-icon is-on" viewBox="0 0 24 24" aria-hidden="true">
            <path class="alt-speed-ring" d="M5.7 16.7A8.45 8.45 0 0 1 17.5 5.8" />
            <path class="alt-speed-drop-on" d="M11.6 7.2c-.7 1.8-2.6 3.2-2.4 5.2.1 1.8 1.6 3.1 3.4 3 1.7-.1 2.9-1.6 2.6-3.3-.3-2-2.3-3.2-3.2-4.9Z" />
          </svg><svg v-else class="transfer-alt-speed-icon is-off" viewBox="0 0 24 24" aria-hidden="true">
            <path class="alt-speed-ring" d="M5.7 16.7A8.45 8.45 0 0 1 17.5 5.8" />
            <path class="alt-speed-drop-off" d="M17.1 9.2c-1.8.7-3.2 2.6-3 4.6.2 1.8 1.7 3 3.5 2.8 1.7-.2 2.7-1.8 2.3-3.5-.4-1.8-1.7-2.8-2.8-3.9Z" />
          </svg></button>
          <div class="transfer-stat is-upload" aria-label="上传传输状态">
            <Upload aria-hidden="true" />
            <span class="transfer-value">{{ formatSpeed(transferInfo.upSpeed) }} <em>[{{ formatLimit(transferInfo.upRateLimit) }}]</em> <small>({{ formatBytes(transferInfo.uploaded) }})</small></span>
          </div>
          <div class="transfer-stat is-download" aria-label="下载传输状态">
            <Download aria-hidden="true" />
            <span class="transfer-value">{{ formatSpeed(transferInfo.downSpeed) }} <em>[{{ formatLimit(transferInfo.downRateLimit) }}]</em> <small>({{ formatBytes(transferInfo.downloaded) }})</small></span>
          </div>
        </footer>
        <nav v-if="taskPageCount > 1" class="task-pagination" aria-label="任务分页">
          <button :disabled="taskPage === 1" @click="goToTaskPage(taskPage - 1)">上一页</button>
          <span>第 {{ taskPage }} / {{ taskPageCount }} 页 · 每页 100 个</span>
          <button :disabled="taskPage === taskPageCount" @click="goToTaskPage(taskPage + 1)">下一页</button>
        </nav>

        <div v-if="columnMenu" class="column-menu" :style="{ left: `${columnMenu.x}px`, top: `${columnMenu.y}px` }" @click.stop>
          <strong>{{ columnMenu.column.label }}列</strong>
          <div class="column-menu-actions">
            <button :disabled="columnMenu.column.locked" @click="toggleTaskColumn(columnMenu.column.key)">{{ columnMenu.column.hidden ? '显示此列' : '隐藏此列' }}</button>
            <button :disabled="columnMenu.column.locked || !canMoveColumn(columnMenu.column.key, -1)" @click="moveTaskColumn(columnMenu.column.key, -1)">向左移动</button>
            <button :disabled="columnMenu.column.locked || !canMoveColumn(columnMenu.column.key, 1)" @click="moveTaskColumn(columnMenu.column.key, 1)">向右移动</button>
          </div>
          <div class="column-menu-divider"></div>
          <span>显示列</span>
          <div class="column-menu-columns">
            <label v-for="column in taskColumns" :key="column.key"><input type="checkbox" :checked="!column.hidden" :disabled="column.locked" @change="toggleTaskColumn(column.key)" />{{ column.label }}</label>
          </div>
        </div>
        <div v-if="taskMenu" class="task-menu" :style="{ left: `${taskMenu.x}px`, top: `${taskMenu.y}px` }" @click.stop>
          <strong>已选 {{ selectedTaskHashes.length }} 个种子</strong>
          <button @click="runTorrentAction('start')">开始</button>
          <button @click="runTorrentAction('forceStart')">强制开始</button>
          <button @click="runTorrentAction('stop')">停止</button>
          <button :disabled="selectedTaskHashes.length !== 1" @click="renameSelectedTask">重命名</button>
          <button @click="editSelectedTaskTags">编辑标签</button>
          <button @click="changeSelectedTaskPath">更改保存路径</button>
          <button @click="setSelectedUploadLimit">限制上传速率</button>
          <button @click="exportSelectedTorrents">导出 torrent</button>
          <button class="danger" @click="openTaskDeleteDialog">删除种子</button>
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
              <span>{{ activeQb?.alias }}</span>
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

    <div v-if="editingQb" class="modal-backdrop" @click.self="editingQb = null">
      <section class="modal edit-qb-modal">
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

    <div v-if="pendingBackupRestore.open" class="modal-backdrop" @click.self="closeBackupRestoreDialog">
      <section class="modal backup-restore-modal">
        <header>
          <h2>加载备份</h2>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" :disabled="pendingBackupRestore.submitting" @click="closeBackupRestoreDialog"><X /></button>
        </header>
        <p>将使用「{{ pendingBackupRestore.filename }}」覆盖当前 qB 账户、横栏、卡片和标签池。</p>
        <p v-if="pendingBackupRestore.error" class="form-error">{{ pendingBackupRestore.error }}</p>
        <div class="modal-actions">
          <button type="button" class="secondary-button" :disabled="pendingBackupRestore.submitting" @click="closeBackupRestoreDialog">取消</button>
          <button type="button" class="primary-button" :disabled="pendingBackupRestore.submitting" @click="confirmBackupRestore"><Loader2 v-if="pendingBackupRestore.submitting" class="spin" /><Upload v-else />确认加载</button>
        </div>
      </section>
    </div>

    <div v-if="taskRenameDialog.open" class="modal-backdrop" @click.self="closeTaskRenameDialog">
      <form class="modal task-rename-modal" @submit.prevent="saveSelectedTaskName">
        <header>
          <h2>重命名种子</h2>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" @click="closeTaskRenameDialog"><X /></button>
        </header>
        <p>为已选种子设置新的名称。</p>
        <label>种子名称<input v-model.trim="taskRenameDialog.name" autofocus /></label>
        <p v-if="taskRenameDialog.error" class="form-error">{{ taskRenameDialog.error }}</p>
        <div class="modal-actions">
          <button type="button" class="secondary-button" @click="closeTaskRenameDialog">取消</button>
          <button class="primary-button" :disabled="!taskRenameDialog.name">确认重命名</button>
        </div>
      </form>
    </div>

    <div v-if="taskPathDialog.open" class="modal-backdrop" @click.self="closeTaskPathDialog">
      <form class="modal task-path-modal" @submit.prevent="saveSelectedTaskPath">
        <header>
          <h2>更改保存路径</h2>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" @click="closeTaskPathDialog"><X /></button>
        </header>
        <p>将把已选 {{ selectedTaskHashes.length }} 个种子移动到以下保存路径。</p>
        <label>保存路径<input v-model.trim="taskPathDialog.savePath" autofocus placeholder="/downloads/movies" /></label>
        <p v-if="taskPathDialog.error" class="form-error">{{ taskPathDialog.error }}</p>
        <div class="modal-actions">
          <button type="button" class="secondary-button" @click="closeTaskPathDialog">取消</button>
          <button class="primary-button" :disabled="!taskPathDialog.savePath">确认更改</button>
        </div>
      </form>
    </div>

    <div v-if="taskTagsDialog.open" class="modal-backdrop" @click.self="closeTaskTagsDialog">
      <form class="modal task-tags-modal" @submit.prevent="saveSelectedTaskTags">
        <header>
          <h2>编辑种子标签</h2>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" @click="closeTaskTagsDialog"><X /></button>
        </header>
        <p>为已选 {{ selectedTaskHashes.length }} 个种子设置标签；输入后按回车添加。</p>
        <div class="task-tags-editor" @click="tagEditorInput?.focus()">
          <span v-for="tag in taskTagsDialog.tags" :key="tag" class="task-edit-tag">{{ tag }}<button type="button" :title="`删除标签 ${tag}`" @click.stop="removeTaskTag(tag)"><X /></button></span>
          <input ref="tagEditorInput" v-model="taskTagsDialog.input" aria-label="添加标签" placeholder="输入标签后按回车" @keydown.enter.prevent="addTaskTag" />
        </div>
        <p class="task-tags-hint">多个标签请逐个输入并按回车；保存后将替换所选种子的现有标签。</p>
        <p v-if="taskTagsDialog.error" class="form-error">{{ taskTagsDialog.error }}</p>
        <div class="modal-actions">
          <button type="button" class="secondary-button" @click="closeTaskTagsDialog">取消</button>
          <button class="primary-button">保存标签</button>
        </div>
      </form>
    </div>

    <div v-if="taskDeleteDialog.open" class="modal-backdrop" @click.self="closeTaskDeleteDialog">
      <section class="modal task-delete-modal">
        <header>
          <h2>删除种子</h2>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" @click="closeTaskDeleteDialog"><X /></button>
        </header>
        <p>确认删除已选 {{ selectedTaskHashes.length }} 个种子任务？</p>
        <label class="task-delete-files-option"><input v-model="taskDeleteDialog.deleteFiles" type="checkbox" /><span>同时删除已下载的文件</span></label>
        <p class="task-delete-hint">未勾选时仅从 qBittorrent 中移除种子任务。</p>
        <p v-if="taskDeleteDialog.error" class="form-error">{{ taskDeleteDialog.error }}</p>
        <div class="modal-actions">
          <button type="button" class="secondary-button" :disabled="taskDeleteDialog.submitting" @click="closeTaskDeleteDialog">取消</button>
          <button type="button" class="danger-button" :disabled="taskDeleteDialog.submitting" @click="confirmTaskDelete"><Loader2 v-if="taskDeleteDialog.submitting" class="spin" /><Trash2 v-else />确认删除</button>
        </div>
      </section>
    </div>

    <div v-if="torrentExportDialog.open" class="modal-backdrop" @click.self="closeTorrentExportDialog">
      <section class="modal torrent-export-modal">
        <header>
          <h2>导出 torrent</h2>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" @click="closeTorrentExportDialog"><X /></button>
        </header>
        <template v-if="!torrentExportDialog.completed">
          <p>将导出已选 {{ selectedTaskHashes.length }} 个种子的 torrent 文件。</p>
          <p class="torrent-export-hint">文件会直接保存到浏览器的默认下载位置。</p>
          <p v-if="torrentExportDialog.error" class="form-error">{{ torrentExportDialog.error }}</p>
          <div class="modal-actions">
            <button type="button" class="secondary-button" :disabled="torrentExportDialog.submitting" @click="closeTorrentExportDialog">取消</button>
            <button type="button" class="primary-button" :disabled="torrentExportDialog.submitting" @click="confirmTorrentExport"><Loader2 v-if="torrentExportDialog.submitting" class="spin" /><Download v-else />导出并下载</button>
          </div>
        </template>
        <template v-else>
          <p class="torrent-export-success"><CheckCircle2 />已开始下载 torrent 文件。</p>
          <p class="torrent-export-hint">如未看到下载项，请检查浏览器的下载权限或默认下载目录。</p>
          <div class="modal-actions"><button type="button" class="primary-button" @click="closeTorrentExportDialog">完成</button></div>
        </template>
      </section>
    </div>

    <div v-if="taskUploadLimitDialog.open" class="modal-backdrop" @click.self="closeTaskUploadLimitDialog">
      <form class="modal task-upload-limit-modal" @submit.prevent="saveSelectedUploadLimit">
        <header>
          <h2>Torrent 上传速度限制</h2>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" @click="closeTaskUploadLimitDialog"><X /></button>
        </header>
        <div class="upload-limit-control">
          <label class="upload-limit-field">
            <span>上传限制</span>
            <div>
              <input v-model.trim="taskUploadLimitDialog.uploadLimit" type="text" inputmode="numeric" autofocus aria-label="上传限制，单位 KiB 每秒" />
              <em>KiB/s</em>
            </div>
          </label>
          <input
            v-model="taskUploadLimitDialog.uploadLimit"
            class="upload-limit-slider"
            type="range"
            min="0"
            max="102400"
            step="128"
            aria-label="上传限制滑块，最大 102400 KiB 每秒"
          />
          <p class="upload-limit-hint">0 表示不限速 · 已选 {{ selectedTaskHashes.length }} 个种子</p>
        </div>
        <p v-if="taskUploadLimitDialog.error" class="form-error">{{ taskUploadLimitDialog.error }}</p>
        <div class="upload-limit-actions">
          <button type="button" class="secondary-button" @click="closeTaskUploadLimitDialog">取消</button>
          <button class="primary-button">确定</button>
        </div>
      </form>
    </div>

    <div v-if="pendingCardUpload.open" class="modal-backdrop" @click.self="closeCardUploadDialog">
      <form class="modal card-upload-modal" @submit.prevent="confirmCardUpload">
        <header>
          <h2>确认添加种子</h2>
          <button type="button" class="icon-button" title="关闭" aria-label="关闭" :disabled="pendingCardUpload.submitting" @click="closeCardUploadDialog"><X /></button>
        </header>
        <p>将向「{{ pendingCardUpload.card?.name }}」添加 {{ pendingCardUpload.files.length }} 个种子。</p>
        <div class="card-upload-file-list" aria-label="待添加的种子文件">
          <span v-for="file in pendingCardUpload.files.slice(0, 5)" :key="`${file.name}-${file.lastModified}`">{{ file.name }}</span>
          <span v-if="pendingCardUpload.files.length > 5">另有 {{ pendingCardUpload.files.length - 5 }} 个种子文件</span>
        </div>
        <p v-if="pendingCardUpload.error" class="form-error">{{ pendingCardUpload.error }}</p>
        <div class="modal-actions">
          <button type="button" class="secondary-button" :disabled="pendingCardUpload.submitting" @click="closeCardUploadDialog">取消</button>
          <button class="primary-button" :disabled="pendingCardUpload.submitting"><Loader2 v-if="pendingCardUpload.submitting" class="spin" /><UploadCloud v-else />{{ pendingCardUpload.submitting ? '添加中' : '确认添加' }}</button>
        </div>
      </form>
    </div>

    <div v-if="uploadNotice.visible" class="upload-result-toast" :class="`is-${uploadNotice.tone}`" role="status" aria-live="polite">
      <CheckCircle2 v-if="uploadNotice.tone === 'success'" />
      <X v-else />
      <span>{{ uploadNotice.text }}</span>
    </div>

    <div v-if="scheduleEditor.open" class="modal-backdrop" @click.self="closeScheduleEditor">
      <form class="modal schedule-editor" @submit.prevent="saveSchedule">
        <header><div><p class="eyebrow">CRON AUTOMATION</p><h2>{{ scheduleEditor.id ? '编辑定时任务' : '新建定时任务' }}</h2></div><button type="button" class="icon-button" @click="closeScheduleEditor"><X /></button></header>
        <label>任务名称<input v-model.trim="scheduleEditor.name" placeholder="例如：深夜开始做种" autofocus /></label>
        <div class="schedule-form-grid"><label>qBittorrent<select v-model="scheduleEditor.qbId"><option v-for="account in config.qbittorrents" :key="account.id" :value="account.id">{{ account.alias }}</option></select></label><label>执行操作<select v-model="scheduleEditor.action"><option value="start">开始</option><option value="forceStart">强制开始</option><option value="stop">停止</option><option value="delete">删除</option><option value="toggleAltSpeed">切换备用速度</option><option value="addURLs">添加种子链接</option></select></label></div>
        <label>Cron 表达式<input v-model.trim="scheduleEditor.cron" placeholder="0 2 * * *" /><small>五段格式：分 时 日 月 周，例如 <code>0 2 * * *</code> 表示每日 02:00。</small></label>
        <template v-if="requiresScheduleTargets">
          <div class="schedule-filter"><div class="schedule-filter-heading"><strong>选择种子</strong><span>已选 {{ scheduleEditor.hashes.length }} 个</span></div><div class="schedule-filter-columns"><section><small>一级：状态</small><label v-for="option in statusOptions" :key="option.key"><input v-model="scheduleFilter.status" type="checkbox" :value="option.key" />{{ option.label }}</label></section><section><small>二级：标签</small><label v-for="tag in scheduleTagOptions" :key="tag"><input v-model="scheduleFilter.tags" type="checkbox" :value="tag" />{{ tag }}</label><i v-if="!scheduleTagOptions.length">暂无标签</i></section><section><small>三级：具体种子</small><label v-for="task in scheduleFilteredTasks" :key="task.hash" class="schedule-torrent-option"><input v-model="scheduleEditor.hashes" type="checkbox" :value="task.hash" /><span>{{ task.name }}</span></label><i v-if="!scheduleFilteredTasks.length">没有匹配的种子</i></section></div></div>
          <label v-if="scheduleEditor.action === 'delete'" class="schedule-delete-files-option"><input v-model="scheduleEditor.deleteFiles" type="checkbox" />同时删除已下载的文件</label>
        </template>
        <template v-else-if="scheduleEditor.action === 'addURLs'"><label>种子链接<textarea v-model.trim="scheduleEditor.torrentUrls" placeholder="每行一个 magnet 或 .torrent URL"></textarea></label><div class="schedule-form-grid"><label>保存路径（可选）<input v-model.trim="scheduleEditor.savePath" placeholder="/downloads" /></label><label>标签（逗号分隔）<input v-model="scheduleTagsText" placeholder="movie, night" /></label></div></template>
        <p v-if="scheduleEditor.error" class="form-error">{{ scheduleEditor.error }}</p><div class="modal-actions"><button type="button" class="secondary-button" @click="closeScheduleEditor">取消</button><button class="primary-button">{{ scheduleEditor.id ? '保存任务' : '创建任务' }}</button></div>
      </form>
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
  Check,
  Save,
  Settings,
  Table2,
  Search,
  Filter,
  Gauge,
  RefreshCw,
  Trash2,
  ChevronUp,
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
const viewRoutes = { cards: 'cards', torrents: 'view', tasks: 'tasks', settings: 'setting' };
const routeViews = Object.fromEntries(Object.entries(viewRoutes).map(([viewName, route]) => [route, viewName]));
const view = ref(viewFromHash());
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
const pendingCardUpload = reactive({ open: false, card: null, files: [], input: null, error: '', submitting: false });
const uploadNotice = reactive({ visible: false, text: '', tone: 'success' });
let uploadNoticeTimer = null;
const editQbMessage = ref('');
const editingLaneId = ref('');
const editingLaneName = ref('');
const committingLaneEdit = ref(false);
const draggingLaneId = ref('');
const laneInputs = reactive({});
const backupFileInput = ref(null);
const backupBusy = ref(false);
const pendingBackupRestore = reactive({ open: false, backup: null, filename: '', error: '', submitting: false });
const backupMessage = ref('');
const backupOk = ref(false);
const tasks = ref([]);
const taskPage = ref(1);
const taskPageSize = 100;
const tasksLoading = ref(false);
const tasksError = ref('');
const taskSearch = ref('');
const filterOpen = ref(false);
const activeFilterGroup = ref('status');
const filterValuePage = ref(1);
const columnMenu = ref(null);
const accountMenuOpen = ref(false);
const taskSort = reactive({ key: 'name', direction: 'asc' });
const taskFilters = reactive({ status: [], path: [], tags: [], tracker: [] });
const filterDraft = reactive({ status: [], path: [], tags: [], tracker: [] });
const taskColumns = reactive(loadTaskColumns());
const trackerMappings = ref([]);
const taskNameTooltip = reactive({ visible: false, text: '', x: 0, y: 0 });
const hoveredTaskHash = ref('');
const selectedTaskHashes = ref([]);
const taskSelectionAnchor = ref('');
const taskMenu = ref(null);
const taskRenameDialog = reactive({ open: false, name: '', error: '' });
const taskPathDialog = reactive({ open: false, savePath: '', error: '' });
const taskTagsDialog = reactive({ open: false, tags: [], originalTags: [], input: '', error: '' });
const tagEditorInput = ref(null);
const taskUploadLimitDialog = reactive({ open: false, uploadLimit: '0', error: '' });
const taskDeleteDialog = reactive({ open: false, deleteFiles: false, submitting: false, error: '' });
const torrentExportDialog = reactive({ open: false, submitting: false, completed: false, error: '' });
const transferInfo = reactive({ downSpeed: 0, upSpeed: 0, downloaded: 0, uploaded: 0, downRateLimit: 0, upRateLimit: 0, altSpeedLimitsOn: false, togglingAltSpeedLimits: false });
const taskTableShell = ref(null);
const taskHorizontalScrollbar = ref(null);
let taskNameTooltipTimer = null;
let taskRefreshTimer = null;
const sidebarCollapsed = ref(localStorage.getItem('qbinder-sidebar-collapsed') === 'true');
const schedules = ref([]);
const scheduleError = ref('');
const scheduleEditor = reactive({ open: false, id: '', name: '', qbId: '', cron: '0 2 * * *', action: 'start', hashes: [], torrentUrls: '', savePath: '', tags: [], deleteFiles: false, enabled: true, error: '' });
const scheduleFilter = reactive({ status: [], tags: [] });
const scheduleTagsText = computed({ get: () => scheduleEditor.tags.join(', '), set: (value) => { scheduleEditor.tags = String(value).split(',').map((item) => item.trim()).filter(Boolean); } });

const loginForm = reactive({ username: '', password: '' });
const credentialForm = reactive({ username: '', password: '' });
const qbForm = reactive({ alias: '', protocol: 'http', host: '', port: '8080', username: '', password: '' });

onMounted(async () => {
  window.addEventListener('hashchange', syncViewFromHash);
  syncViewFromHash();
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
  if (next === 'tasks') loadSchedules();
  if (next === 'torrents') {
    loadTasks();
    startTaskRefresh();
  } else {
    stopTaskRefresh();
    closeTaskPopovers();
  }
});

watch(activeQbId, () => {
  if (view.value === 'torrents') loadTasks();
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

const requiresScheduleTargets = computed(() => ['start', 'forceStart', 'stop', 'delete'].includes(scheduleEditor.action));
const scheduleTagOptions = computed(() => [...new Set(tasks.value.flatMap(taskTags))].sort((left, right) => left.localeCompare(right, 'zh-CN')));
const scheduleFilteredTasks = computed(() => tasks.value.filter((task) => {
  const statusMatches = !scheduleFilter.status.length || scheduleFilter.status.some((status) => taskMatchesStatus(task, status));
  const tagMatches = !scheduleFilter.tags.length || taskTags(task).some((tag) => scheduleFilter.tags.includes(tag));
  return statusMatches && tagMatches;
}));

const visibleTaskColumns = computed(() => taskColumns.filter((column) => !column.hidden));
const taskGridStyle = computed(() => ({ '--task-columns': visibleTaskColumns.value.map((column) => `${column.width}px`).join(' ') }));
const taskScrollbarContentStyle = computed(() => ({ width: `${visibleTaskColumns.value.reduce((total, column) => total + column.width, 0)}px` }));
const hoveredTaskIndex = computed(() => {
  const index = filteredTasks.value.findIndex((task) => task.hash === hoveredTaskHash.value);
  return index < 0 ? 0 : index + 1;
});
const selectedTaskIndexes = computed(() => selectedTaskHashes.value.map((hash) => filteredTasks.value.findIndex((task) => task.hash === hash) + 1).filter(Boolean).sort((left, right) => left - right));
const selectedTaskSummary = computed(() => {
  const indexes = selectedTaskIndexes.value;
  if (!indexes.length) return '';
  const rows = indexes.length === 1 ? `${indexes[0]}` : `${indexes[0]}–${indexes[indexes.length - 1]}`;
  return `所选第 ${rows} 行，共 ${indexes.length} 个任务`;
});
function syncTaskScrollbar(event) {
  if (taskHorizontalScrollbar.value) taskHorizontalScrollbar.value.scrollLeft = event.currentTarget.scrollLeft;
}

function syncTaskTableScroll(event) {
  if (taskTableShell.value) taskTableShell.value.scrollLeft = event.currentTarget.scrollLeft;
}

const statusOptions = [
  { key: 'downloading', label: '下载' }, { key: 'seeding', label: '做种' }, { key: 'completed', label: '完成' },
  { key: 'running', label: '正运行' }, { key: 'stopped', label: '已停止' }, { key: 'error', label: '错误' }
];
const taskFilterGroups = computed(() => [
  { key: 'status', label: '状态', values: statusOptions.map((item) => item.key), labels: Object.fromEntries(statusOptions.map((item) => [item.key, item.label])) },
  { key: 'path', label: '路径', values: uniqueTaskValues((task) => task.save_path) },
  { key: 'tags', label: '标签', values: [...new Set(tasks.value.flatMap(taskTags))].sort((a, b) => a.localeCompare(b, 'zh-CN')) },
  { key: 'tracker', label: 'Tracker', values: uniqueTaskValues((task) => trackerDisplayName(task.tracker)) }
]);
const activeTaskFilterGroup = computed(() => taskFilterGroups.value.find((group) => group.key === activeFilterGroup.value) || taskFilterGroups.value[0]);
const filterPageCount = computed(() => Math.max(1, Math.ceil(activeTaskFilterGroup.value.values.length / 10)));
const pagedFilterValues = computed(() => activeTaskFilterGroup.value.values.slice((filterValuePage.value - 1) * 10, filterValuePage.value * 10));
function selectFilterGroup(key) {
  activeFilterGroup.value = key;
  filterValuePage.value = 1;
}

function selectCurrentFilterPage() {
  const selected = filterDraft[activeFilterGroup.value];
  filterDraft[activeFilterGroup.value] = [...new Set([...selected, ...pagedFilterValues.value])];
}

function clearCurrentFilterGroup() {
  filterDraft[activeFilterGroup.value] = [];
}

function filterValueLabel(group, value) {
  return group.labels?.[value] || value;
}

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
    pendingBackupRestore.backup = JSON.parse(await file.text());
    pendingBackupRestore.filename = file.name;
    pendingBackupRestore.error = '';
    pendingBackupRestore.open = true;
  } catch (requestError) {
    backupMessage.value = requestError.message || '备份文件解析失败';
  } finally {
    backupBusy.value = false;
    event.target.value = '';
  }
}

function closeBackupRestoreDialog(force = false) {
  if (pendingBackupRestore.submitting && !force) return;
  pendingBackupRestore.open = false;
  pendingBackupRestore.backup = null;
  pendingBackupRestore.filename = '';
  pendingBackupRestore.error = '';
}

async function confirmBackupRestore() {
  if (!pendingBackupRestore.backup) return;
  pendingBackupRestore.submitting = true;
  pendingBackupRestore.error = '';
  backupMessage.value = '';
  backupOk.value = false;
  try {
    config.value = await api('/api/config/restore', { method: 'POST', body: JSON.stringify(pendingBackupRestore.backup) });
    activeQbId.value = config.value.qbittorrents[0]?.id || '';
    backupOk.value = true;
    backupMessage.value = '备份已加载';
    closeBackupRestoreDialog(true);
  } catch (requestError) {
    pendingBackupRestore.error = requestError.message || '备份加载失败';
  } finally {
    pendingBackupRestore.submitting = false;
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

function scrollQbAccounts(event) {
  event.currentTarget.scrollLeft += event.deltaY || event.deltaX;
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

function uploadFiles(card, event) {
  const files = [...event.target.files];
  const maxUploadSize = 32 * 1024 * 1024;
  if (!files.length) return;
  if (files.length > 50 || files.some((file) => !file.name.toLowerCase().endsWith('.torrent')) || files.reduce((total, file) => total + file.size, 0) > maxUploadSize) {
    event.target.value = '';
    showUploadNotice('仅支持最多 50 个 .torrent 文件，总大小不能超过 32 MB。', 'error');
    return;
  }
  Object.assign(pendingCardUpload, { open: true, card, files, input: event.target, error: '', submitting: false });
}

function closeCardUploadDialog() {
  if (pendingCardUpload.submitting) return;
  pendingCardUpload.input && (pendingCardUpload.input.value = '');
  Object.assign(pendingCardUpload, { open: false, card: null, files: [], input: null, error: '', submitting: false });
}

function showUploadNotice(text, tone = 'success') {
  window.clearTimeout(uploadNoticeTimer);
  Object.assign(uploadNotice, { visible: true, text, tone });
  uploadNoticeTimer = window.setTimeout(() => {
    uploadNotice.visible = false;
  }, 4200);
}

async function confirmCardUpload() {
  const { card, files } = pendingCardUpload;
  if (!card || !files.length) return;
  const form = new FormData();
  files.forEach((file) => form.append('torrents', file));
  pendingCardUpload.submitting = true;
  pendingCardUpload.error = '';
  uploadingCardId.value = card.id;
  try {
    const result = await api(`/api/cards/${card.id}/upload`, { method: 'POST', body: form });
    const count = Number(result?.count) || files.length;
    closeCardUploadDialogAfterSubmit();
    showUploadNotice(`成功添加 ${count} 个种子`);
  } catch (requestError) {
    pendingCardUpload.error = requestError.message || '添加种子失败';
  } finally {
    uploadingCardId.value = '';
    pendingCardUpload.submitting = false;
  }
}

function closeCardUploadDialogAfterSubmit() {
  pendingCardUpload.input && (pendingCardUpload.input.value = '');
  Object.assign(pendingCardUpload, { open: false, card: null, files: [], input: null, error: '', submitting: false });
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
    { key: 'progress', label: '进度', width: 240 },
    { key: 'status', label: '状态', width: 104 },
    { key: 'seeders', label: '做种', width: 96 },
    { key: 'leechers', label: '用户', width: 96 },
    { key: 'dlspeed', label: '下载', width: 118 },
    { key: 'upspeed', label: '上传', width: 118 },
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
    const movable = ordered.filter((column) => !column.locked);
    const statusIndex = movable.findIndex((column) => column.key === 'status');
    const status = statusIndex >= 0 ? movable.splice(statusIndex, 1)[0] : null;
    const progressIndex = movable.findIndex((column) => column.key === 'progress');
    if (status) movable.splice(Math.max(0, progressIndex + 1), 0, status);
    return [...pinned, ...movable];
  } catch {
    return defaults;
  }
}

function persistTaskColumns() {
  localStorage.setItem('qbinder-task-columns', JSON.stringify(taskColumns.map(({ key, width, hidden }) => ({ key, width, hidden }))));
}

function clampWidth(value, fallback) {
  const width = Number(value);
  return Number.isFinite(width) ? Math.max(56, Math.min(720, width)) : fallback;
}

async function loadSchedules() {
  scheduleError.value = '';
  try {
    const response = await api('/api/schedules');
    schedules.value = Array.isArray(response.schedules) ? response.schedules : [];
  } catch (requestError) {
    scheduleError.value = requestError.message || '无法加载定时任务';
  }
}

async function openScheduleEditor(schedule = null) {
  scheduleError.value = '';
  Object.assign(scheduleEditor, { open: true, id: schedule?.id || '', name: schedule?.name || '', qbId: schedule?.qbId || activeQb.value?.id || '', cron: schedule?.cron || '0 2 * * *', action: schedule?.action || 'start', hashes: [...(schedule?.hashes || [])], torrentUrls: schedule?.torrentUrls || '', savePath: schedule?.savePath || '', tags: [...(schedule?.tags || [])], deleteFiles: Boolean(schedule?.deleteFiles), enabled: schedule?.enabled ?? true, error: '' });
  scheduleFilter.status = [];
  scheduleFilter.tags = [];
  if (requiresScheduleTargets.value && activeQb.value) await loadTasks();
}

function closeScheduleEditor() { scheduleEditor.open = false; scheduleEditor.error = ''; }

async function saveSchedule() {
  const payload = { name: scheduleEditor.name, qbId: scheduleEditor.qbId, cron: scheduleEditor.cron, action: scheduleEditor.action, hashes: scheduleEditor.hashes, torrentUrls: scheduleEditor.torrentUrls, savePath: scheduleEditor.savePath, tags: scheduleEditor.tags, deleteFiles: scheduleEditor.deleteFiles, enabled: scheduleEditor.enabled };
  scheduleEditor.error = '';
  try {
    const response = await api(scheduleEditor.id ? `/api/schedules/${scheduleEditor.id}` : '/api/schedules', { method: scheduleEditor.id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    schedules.value = scheduleEditor.id ? (Array.isArray(response.schedules) ? response.schedules : schedules.value) : [...schedules.value, response];
    closeScheduleEditor();
  } catch (requestError) { scheduleEditor.error = requestError.message || '保存定时任务失败'; }
}

async function toggleSchedule(schedule) {
  try {
    const response = await api(`/api/schedules/${schedule.id}`, { method: 'PUT', body: JSON.stringify({ ...schedule, enabled: !schedule.enabled }) });
    schedules.value = Array.isArray(response.schedules) ? response.schedules : schedules.value;
  } catch (requestError) { scheduleError.value = requestError.message || '更新任务状态失败'; }
}

async function deleteSchedule(schedule) {
  if (!window.confirm(`确认删除定时任务“${schedule.name}”？`)) return;
  try {
    const response = await api(`/api/schedules/${schedule.id}`, { method: 'DELETE' });
    schedules.value = Array.isArray(response.schedules) ? response.schedules : schedules.value.filter((item) => item.id !== schedule.id);
  } catch (requestError) { scheduleError.value = requestError.message || '删除定时任务失败'; }
}

function scheduleActionLabel(action) { return ({ start: '开始', forceStart: '强制开始', stop: '停止', delete: '删除', toggleAltSpeed: '切换备用速度', addURLs: '添加种子链接' })[action] || action; }
function scheduleTargetLabel(schedule) { if (schedule.action === 'toggleAltSpeed') return '全局备用速度'; if (schedule.action === 'addURLs') return '添加新的种子链接'; return `${schedule.hashes?.length || 0} 个指定种子`; }
function formatScheduleDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }); }

async function loadTasks() {
  if (!activeQb.value || tasksLoading.value) return;
  tasksLoading.value = true;
  tasksError.value = '';
  try {
    const result = await api(`/api/qb/${activeQb.value.id}/torrents`);
    tasks.value = Array.isArray(result.tasks) ? result.tasks : [];
    selectedTaskHashes.value = selectedTaskHashes.value.filter((hash) => tasks.value.some((task) => task.hash === hash));
    Object.assign(transferInfo, result.transfer || {});
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
  }, 500);
}

function hideTaskNameTooltip() {
  window.clearTimeout(taskNameTooltipTimer);
  taskNameTooltip.visible = false;
}

function startTaskRefresh() {
  stopTaskRefresh();
  taskRefreshTimer = window.setInterval(() => {
    if (view.value === 'tasks' && document.visibilityState === 'visible') loadTasks();
  }, 2000);
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

function taskTagTone(tag) {
  let hash = 0;
  for (const character of String(tag)) {
    hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
  }
  return Math.abs(hash) % 8;
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

function taskStatusLabel(task) {
  if (task.progress >= 1) return taskMatchesStatus(task, 'seeding') ? '做种中' : '已完成';
  if (taskMatchesStatus(task, 'error')) return '错误';
  if (taskMatchesStatus(task, 'stopped')) return '已停止';
  if (taskMatchesStatus(task, 'downloading')) return '下载中';
  if (taskMatchesStatus(task, 'seeding')) return '做种中';
  return '运行中';
}

function taskStatusClass(task) {
  return `is-${taskStatusLabel(task).replaceAll('中', '').replaceAll('已', '')}`;
}

function compareTasks(left, right, key, direction) {
  const valueKey = { seeders: 'num_seeds', leechers: 'num_leechs' }[key] || key;
  const leftValue = key === 'status' ? taskStatusLabel(left) : key === 'tags' ? taskTags(left).join(',') : key === 'tracker' ? trackerDisplayName(left.tracker) : left[valueKey];
  const rightValue = key === 'status' ? taskStatusLabel(right) : key === 'tags' ? taskTags(right).join(',') : key === 'tracker' ? trackerDisplayName(right.tracker) : right[valueKey];
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

function formatLimit(value) {
  return Number(value) > 0 ? formatSpeed(value) : '不限速';
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
    case 'status': return taskStatusLabel(task);
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

const selectedTaskFilters = computed(() => taskFilterGroups.value.flatMap((group) => taskFilters[group.key].map((value) => ({
  key: group.key,
  value,
  label: group.labels?.[value] || value
}))));

const selectedFilterCandidates = computed(() => taskFilterGroups.value.flatMap((group) => {
  const selected = filterDraft[group.key];
  const allSelected = group.values.length > 0 && group.values.every((value) => selected.includes(value));
  if (allSelected) return [{ key: group.key, value: '__all__', groupLabel: group.label, label: '全部', all: true }];
  return selected.map((value) => ({
    key: group.key,
    value,
    groupLabel: group.label,
    label: group.labels?.[value] || value,
    all: false
  }));
}));

const hasFilterCandidates = computed(() => selectedFilterCandidates.value.length > 0);

function copyFilterValues(target, source) {
  Object.keys(target).forEach((key) => { target[key] = [...source[key]]; });
}

function toggleTaskFilter() {
  if (filterOpen.value) return discardTaskFilters();
  copyFilterValues(filterDraft, taskFilters);
  filterOpen.value = true;
}

function removeFilterCandidate(candidate) {
  if (candidate.all) {
    filterDraft[candidate.key] = [];
    return;
  }
  filterDraft[candidate.key] = filterDraft[candidate.key].filter((item) => item !== candidate.value);
}

function clearFilterCandidates() {
  Object.keys(filterDraft).forEach((key) => { filterDraft[key] = []; });
}

function applyTaskFilters() {
  copyFilterValues(taskFilters, filterDraft);
  filterOpen.value = false;
}

function discardTaskFilters() {
  filterOpen.value = false;
  copyFilterValues(filterDraft, taskFilters);
}

function closeTaskPopovers() {
  if (filterOpen.value) discardTaskFilters();
  columnMenu.value = null;
  taskMenu.value = null;
  accountMenuOpen.value = false;
}

function closeTaskMenuOnOutsideClick(event) {
  if (taskMenu.value && !event.target.closest('.task-menu')) taskMenu.value = null;
}

function selectTask(task, event) {
  const currentIndex = filteredTasks.value.findIndex((item) => item.hash === task.hash);
  if (event.shiftKey && taskSelectionAnchor.value) {
    const anchorIndex = filteredTasks.value.findIndex((item) => item.hash === taskSelectionAnchor.value);
    if (anchorIndex >= 0) selectedTaskHashes.value = filteredTasks.value.slice(Math.min(anchorIndex, currentIndex), Math.max(anchorIndex, currentIndex) + 1).map((item) => item.hash);
  } else if (event.ctrlKey || event.metaKey) {
    selectedTaskHashes.value = selectedTaskHashes.value.includes(task.hash) ? selectedTaskHashes.value.filter((hash) => hash !== task.hash) : [...selectedTaskHashes.value, task.hash];
    taskSelectionAnchor.value = task.hash;
  } else {
    selectedTaskHashes.value = [task.hash];
    taskSelectionAnchor.value = task.hash;
  }
}

function openTaskMenu(task, event) {
  if (!selectedTaskHashes.value.includes(task.hash)) selectTask(task, event);
  filterOpen.value = false;
  columnMenu.value = null;
  taskMenu.value = { x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 310) };
}

async function runTorrentAction(action, extra = {}) {
  if (!activeQb.value || !selectedTaskHashes.value.length) return false;
  try {
    await api(`/api/qb/${activeQb.value.id}/torrents/action`, { method: 'POST', body: JSON.stringify({ action, hashes: selectedTaskHashes.value, ...extra }) });
    taskMenu.value = null;
    await loadTasks();
    return true;
  } catch (requestError) {
    tasksError.value = requestError.message;
    return false;
  }
}

function renameSelectedTask() {
  const task = tasks.value.find((item) => item.hash === selectedTaskHashes.value[0]);
  taskMenu.value = null;
  taskRenameDialog.name = task?.name || '';
  taskRenameDialog.error = '';
  taskRenameDialog.open = true;
}

async function toggleAlternativeSpeedLimits() {
  if (!activeQb.value || transferInfo.togglingAltSpeedLimits) return;
  transferInfo.togglingAltSpeedLimits = true;
  tasksError.value = '';
  try {
    await api(`/api/qb/${activeQb.value.id}/transfer/toggle-speed-limits`, { method: 'POST' });
    transferInfo.altSpeedLimitsOn = !transferInfo.altSpeedLimitsOn;
    await loadTasks();
  } catch (requestError) {
    tasksError.value = requestError.message || '备用速度切换失败';
  } finally {
    transferInfo.togglingAltSpeedLimits = false;
  }
}

function closeTaskRenameDialog() {
  taskRenameDialog.open = false;
  taskRenameDialog.name = '';
  taskRenameDialog.error = '';
}

async function saveSelectedTaskName() {
  const name = taskRenameDialog.name.trim();
  if (!name) {
    taskRenameDialog.error = '请输入种子名称。';
    return;
  }
  if (!activeQb.value || selectedTaskHashes.value.length !== 1) return;
  const saved = await runTorrentAction('rename', { name });
  if (saved) closeTaskRenameDialog();
  else taskRenameDialog.error = tasksError.value || '重命名失败，请稍后重试。';
}

function editSelectedTaskTags() {
  const selected = tasks.value.filter((task) => selectedTaskHashes.value.includes(task.hash));
  taskMenu.value = null;
  taskTagsDialog.tags = [...new Set(selected.flatMap((task) => taskTags(task)))];
  taskTagsDialog.originalTags = [...taskTagsDialog.tags];
  taskTagsDialog.input = '';
  taskTagsDialog.error = '';
  taskTagsDialog.open = true;
}

function addTaskTag() {
  const tag = taskTagsDialog.input.trim();
  if (!tag) return true;
  if (tag.includes(',')) {
    taskTagsDialog.error = '标签名称不能包含英文逗号。';
    return false;
  }
  if (!taskTagsDialog.tags.includes(tag)) taskTagsDialog.tags.push(tag);
  taskTagsDialog.input = '';
  taskTagsDialog.error = '';
  return true;
}

function removeTaskTag(tag) {
  taskTagsDialog.tags = taskTagsDialog.tags.filter((item) => item !== tag);
}

function closeTaskTagsDialog() {
  taskTagsDialog.open = false;
  taskTagsDialog.tags = [];
  taskTagsDialog.originalTags = [];
  taskTagsDialog.input = '';
  taskTagsDialog.error = '';
}

async function saveSelectedTaskTags() {
  if (!addTaskTag() || !activeQb.value || !selectedTaskHashes.value.length) return;
  try {
    await api(`/api/qb/${activeQb.value.id}/torrents/action`, {
      method: 'POST',
      body: JSON.stringify({ action: 'setTags', hashes: selectedTaskHashes.value, tags: taskTagsDialog.tags, existingTags: taskTagsDialog.originalTags })
    });
    closeTaskTagsDialog();
    await loadTasks();
  } catch (requestError) {
    taskTagsDialog.error = requestError.message || '保存标签失败，请稍后重试。';
  }
}

function changeSelectedTaskPath() {
  taskMenu.value = null;
  taskPathDialog.savePath = '';
  taskPathDialog.error = '';
  taskPathDialog.open = true;
}

function closeTaskPathDialog() {
  taskPathDialog.open = false;
  taskPathDialog.savePath = '';
  taskPathDialog.error = '';
}

async function saveSelectedTaskPath() {
  const savePath = taskPathDialog.savePath.trim();
  if (!savePath) {
    taskPathDialog.error = '请输入保存路径。';
    return;
  }
  if (!activeQb.value || !selectedTaskHashes.value.length) return;
  try {
    await api(`/api/qb/${activeQb.value.id}/torrents/action`, {
      method: 'POST',
      body: JSON.stringify({ action: 'setLocation', hashes: selectedTaskHashes.value, savePath })
    });
    closeTaskPathDialog();
    await loadTasks();
  } catch (requestError) {
    taskPathDialog.error = requestError.message;
  }
}

function setSelectedUploadLimit() {
  taskMenu.value = null;
  taskUploadLimitDialog.uploadLimit = '0';
  taskUploadLimitDialog.error = '';
  taskUploadLimitDialog.open = true;
}

function closeTaskUploadLimitDialog() {
  taskUploadLimitDialog.open = false;
  taskUploadLimitDialog.uploadLimit = '0';
  taskUploadLimitDialog.error = '';
}

async function saveSelectedUploadLimit() {
  const value = String(taskUploadLimitDialog.uploadLimit).trim();
  if (!/^\d+$/.test(value)) {
    taskUploadLimitDialog.error = '请输入非负整数（单位：KiB/s）。';
    return;
  }
  const uploadLimitKiB = Number(value);
  const uploadLimit = uploadLimitKiB * 1024;
  if (!Number.isSafeInteger(uploadLimit)) {
    taskUploadLimitDialog.error = '上传限速数值过大。';
    return;
  }
  if (!activeQb.value || !selectedTaskHashes.value.length) return;
  try {
    await api(`/api/qb/${activeQb.value.id}/torrents/action`, {
      method: 'POST',
      body: JSON.stringify({ action: 'setUploadLimit', hashes: selectedTaskHashes.value, uploadLimit })
    });
    closeTaskUploadLimitDialog();
    await loadTasks();
  } catch (requestError) {
    taskUploadLimitDialog.error = requestError.message;
  }
}

function openTaskDeleteDialog() {
  taskMenu.value = null;
  taskDeleteDialog.deleteFiles = false;
  taskDeleteDialog.error = '';
  taskDeleteDialog.open = true;
}

function closeTaskDeleteDialog() {
  if (taskDeleteDialog.submitting) return;
  taskDeleteDialog.open = false;
  taskDeleteDialog.deleteFiles = false;
  taskDeleteDialog.error = '';
}

async function confirmTaskDelete() {
  if (!activeQb.value || !selectedTaskHashes.value.length || taskDeleteDialog.submitting) return;
  taskDeleteDialog.submitting = true;
  taskDeleteDialog.error = '';
  try {
    await api(`/api/qb/${activeQb.value.id}/torrents/action`, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', hashes: selectedTaskHashes.value, deleteFiles: taskDeleteDialog.deleteFiles })
    });
    taskDeleteDialog.submitting = false;
    closeTaskDeleteDialog();
    await loadTasks();
  } catch (requestError) {
    taskDeleteDialog.error = requestError.message || '删除种子失败，请稍后重试。';
    taskDeleteDialog.submitting = false;
  }
}

function exportSelectedTorrents() {
  if (!activeQb.value || !selectedTaskHashes.value.length) return;
  taskMenu.value = null;
  torrentExportDialog.error = '';
  torrentExportDialog.completed = false;
  torrentExportDialog.open = true;
}

function closeTorrentExportDialog() {
  if (torrentExportDialog.submitting) return;
  torrentExportDialog.open = false;
  torrentExportDialog.error = '';
  torrentExportDialog.completed = false;
}

async function confirmTorrentExport() {
  if (!activeQb.value || !selectedTaskHashes.value.length || torrentExportDialog.submitting) return;
  torrentExportDialog.submitting = true;
  torrentExportDialog.error = '';
  try {
    const selectedTasks = selectedTaskHashes.value.map((hash) => tasks.value.find((task) => task.hash === hash));
    const exportQuery = new URLSearchParams({
      hashes: selectedTaskHashes.value.join('|'),
      names: selectedTasks.map((task, index) => task?.name || selectedTaskHashes.value[index]).join('|')
    });
    const response = await fetch(`/api/qb/${activeQb.value.id}/torrents/export?${exportQuery.toString()}`, { credentials: 'include' });
    if (!response.ok) {
      const responseText = await response.text();
      let responseError = '导出 torrent 失败，请稍后重试。';
      try { responseError = JSON.parse(responseText)?.error || responseError; } catch { if (responseText) responseError = responseText; }
      throw new Error(responseError);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('未收到可导出的 torrent 文件。');
    const link = document.createElement('a');
    const objectURL = URL.createObjectURL(blob);
    const filenameMatch = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i);
    link.href = objectURL;
    link.download = filenameMatch?.[1] || (selectedTaskHashes.value.length === 1 ? `${selectedTasks[0]?.name || selectedTaskHashes.value[0]}.torrent` : 'selected-torrents.zip');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
    torrentExportDialog.completed = true;
  } catch (requestError) {
    torrentExportDialog.error = requestError.message || '导出 torrent 失败，请稍后重试。';
  } finally {
    torrentExportDialog.submitting = false;
  }
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
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const startX = event.clientX;
  const startWidth = column.width;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('task-column-resizing');
  const resize = (moveEvent) => {
    column.width = clampWidth(startWidth + moveEvent.clientX - startX, startWidth);
  };
  const finish = () => {
    handle.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('task-column-resizing');
    window.removeEventListener('pointermove', resize);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    persistTaskColumns();
  };
  window.addEventListener('pointermove', resize);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

onUnmounted(() => {
  window.removeEventListener('hashchange', syncViewFromHash);
  window.clearTimeout(uploadNoticeTimer);
  stopTaskRefresh();
});

function viewFromHash() {
  const route = window.location.hash.replace(/^#\/?/, '').trim();
  return routeViews[route] || 'cards';
}

function syncViewFromHash() {
  const nextView = viewFromHash();
  const canonicalHash = `#/${viewRoutes[nextView]}`;
  if (window.location.hash !== canonicalHash) {
    window.history.replaceState(null, '', canonicalHash);
  }
  view.value = nextView;
}

function navigateToView(nextView) {
  const route = viewRoutes[nextView] || viewRoutes.cards;
  const nextHash = `#/${route}`;
  if (window.location.hash === nextHash) {
    view.value = nextView;
    return;
  }
  window.location.hash = `/${route}`;
}

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
