import axios from 'axios';
import {
  Boxes,
  CheckCircle2,
  FolderDown,
  Image,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Plus,
  Save,
  Settings,
  Tags,
  UploadCloud,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

axios.defaults.withCredentials = true;

const monetColors = ['#d8e8e2', '#eadfd2', '#d7ddea', '#e8d9dd', '#dce6cf', '#d6e3ea', '#e7e0c9', '#d9d2e7'];
const accentColors = ['#7d8fd7', '#8eb7a4', '#d0a49b', '#bfa6d9', '#d7bc76', '#8fb7c8', '#c6b4a4'];

function pickColor(seed, palette = monetColors) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function useApiState() {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/config')
      .then((response) => {
        setConfig(response.data);
        setUser({ username: response.data.username });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { config, setConfig, user, setUser, loading };
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: 'qBinder', password: 'qBinder' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await axios.post('/api/auth/login', form);
      onLogin(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-lockup big">
          <img src="/logo.svg" alt="qBinder" />
          <div>
            <strong>qBinder</strong>
            <span>qBittorrent Docker Assistant</span>
          </div>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            账号
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="username" />
          </label>
          <label>
            密码
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? <Loader2 className="spin" /> : <KeyRound />}登录</button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({ view, setView, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <img src="/logo.svg" alt="qBinder" />
        <div>
          <strong>qBinder</strong>
          <span>v0.1</span>
        </div>
      </div>
      <nav>
        <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}><Boxes />卡片</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings />设置</button>
      </nav>
      <button className="ghost-button logout" onClick={onLogout}><LogOut />退出</button>
    </aside>
  );
}

function SettingsPage({ config, setConfig }) {
  const [qbForm, setQbForm] = useState({ alias: '', protocol: 'http', host: '', port: '8080', username: '', password: '' });
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState('');
  const [credentialForm, setCredentialForm] = useState({ username: config.username, password: '' });

  async function testQb() {
    setMessage('');
    setVerified(false);
    try {
      await axios.post('/api/qb/test', qbForm);
      setVerified(true);
      setMessage('连接验证成功');
    } catch (error) {
      setMessage(error.response?.data?.error || '连接验证失败');
    }
  }

  async function addQb() {
    const response = await axios.post('/api/qb', qbForm);
    setConfig(response.data);
    setQbForm({ alias: '', protocol: 'http', host: '', port: '8080', username: '', password: '' });
    setVerified(false);
    setMessage('已添加 qB 账户');
  }

  async function deleteQb(id) {
    const response = await axios.delete(`/api/qb/${id}`);
    setConfig(response.data);
  }

  async function saveCredentials(event) {
    event.preventDefault();
    if (!credentialForm.username || !credentialForm.password) return;
    await axios.put('/api/auth/credentials', credentialForm);
    setConfig({ ...config, username: credentialForm.username });
    setCredentialForm({ username: credentialForm.username, password: '' });
  }

  return (
    <div className="content settings-page">
      <header className="page-header">
        <div>
          <h1>设置</h1>
          <p>管理 qBinder 登录账号和 qBittorrent 连接。</p>
        </div>
      </header>

      <section className="settings-grid">
        <form className="setting-panel" onSubmit={saveCredentials}>
          <h2><KeyRound />登录账号</h2>
          <label>账号<input value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} /></label>
          <label>新密码<input type="password" value={credentialForm.password} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} /></label>
          <button className="primary-button"><Save />保存账号密码</button>
        </form>

        <section className="setting-panel wide">
          <h2><Layers />添加 qBittorrent</h2>
          <div className="qb-form">
            <label>别名<input value={qbForm.alias} onChange={(event) => { setVerified(false); setQbForm({ ...qbForm, alias: event.target.value }); }} /></label>
            <label>协议<select value={qbForm.protocol} onChange={(event) => { setVerified(false); setQbForm({ ...qbForm, protocol: event.target.value }); }}><option>http</option><option>https</option></select></label>
            <label>地址<input value={qbForm.host} placeholder="192.168.1.10" onChange={(event) => { setVerified(false); setQbForm({ ...qbForm, host: event.target.value }); }} /></label>
            <label>端口<input value={qbForm.port} onChange={(event) => { setVerified(false); setQbForm({ ...qbForm, port: event.target.value }); }} /></label>
            <label>账号<input value={qbForm.username} onChange={(event) => { setVerified(false); setQbForm({ ...qbForm, username: event.target.value }); }} /></label>
            <label>密码<input type="password" value={qbForm.password} onChange={(event) => { setVerified(false); setQbForm({ ...qbForm, password: event.target.value }); }} /></label>
          </div>
          {message && <p className={verified ? 'form-ok' : 'form-error'}>{message}</p>}
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={testQb}><CheckCircle2 />验证</button>
            <button type="button" className="primary-button" disabled={!verified} onClick={addQb}><Plus />添加</button>
          </div>
        </section>
      </section>

      <section className="accounts-list">
        <h2>已配置 qB 账户</h2>
        {config.qbittorrents.length === 0 && <div className="empty-state">还没有添加 qBittorrent 账户。</div>}
        {config.qbittorrents.map((account) => (
          <div className="account-row" key={account.id}>
            <div>
              <strong>{account.alias}</strong>
              <span>{account.protocol}://{account.host}:{account.port}</span>
            </div>
            <button className="danger-button" onClick={() => deleteQb(account.id)}>删除</button>
          </div>
        ))}
      </section>
    </div>
  );
}

function CardsPage({ config, setConfig }) {
  const [activeQbId, setActiveQbId] = useState(config.qbittorrents[0]?.id || '');
  const [laneName, setLaneName] = useState('');
  const [editingCard, setEditingCard] = useState(null);
  const activeQb = config.qbittorrents.find((item) => item.id === activeQbId) || config.qbittorrents[0];

  useEffect(() => {
    if (!activeQbId && config.qbittorrents[0]) setActiveQbId(config.qbittorrents[0].id);
  }, [activeQbId, config.qbittorrents]);

  async function addLane(event) {
    event.preventDefault();
    if (!activeQb || !laneName.trim()) return;
    const response = await axios.post('/api/lanes', { qbId: activeQb.id, name: laneName.trim() });
    setConfig(response.data);
    setLaneName('');
  }

  async function createCard(laneId) {
    const response = await axios.post('/api/cards', { qbId: activeQb.id, laneId, name: '新卡片', tags: [], cover: { type: 'monet', value: '' } });
    setConfig(response.data);
    const latest = response.data.cards[response.data.cards.length - 1];
    setEditingCard(latest);
  }

  if (!config.qbittorrents.length) {
    return (
      <div className="content cards-page">
        <div className="empty-workspace">
          <img src="/logo.svg" alt="qBinder" />
          <h1>先添加 qBittorrent 账户</h1>
          <p>进入设置页面添加并验证连接后，就可以为不同 qB 账户创建卡片。</p>
        </div>
      </div>
    );
  }

  const lanes = config.lanes.filter((lane) => lane.qbId === activeQb.id);

  return (
    <div className="content cards-page">
      <header className="top-tabs">
        {config.qbittorrents.map((account) => (
          <button key={account.id} className={account.id === activeQb.id ? 'active' : ''} onClick={() => setActiveQbId(account.id)}>{account.alias}</button>
        ))}
      </header>

      <form className="lane-create" onSubmit={addLane}>
        <input value={laneName} placeholder="新增横栏名称" onChange={(event) => setLaneName(event.target.value)} />
        <button className="primary-button"><Plus />添加横栏</button>
      </form>

      {lanes.length === 0 && <div className="empty-state">当前 qB 账户下还没有横栏。</div>}
      {lanes.map((lane) => (
        <Lane key={lane.id} lane={lane} cards={config.cards.filter((card) => card.laneId === lane.id)} onAddCard={() => createCard(lane.id)} onEditCard={setEditingCard} setConfig={setConfig} />
      ))}
      {editingCard && <CardModal card={editingCard} config={config} setConfig={setConfig} onClose={() => setEditingCard(null)} />}
    </div>
  );
}

function Lane({ lane, cards, onAddCard, onEditCard, setConfig }) {
  return (
    <section className="lane">
      <div className="lane-title">
        <h2>{lane.name}</h2>
        <button className="icon-button" title="添加卡片" onClick={onAddCard}><Plus /></button>
      </div>
      <div className="card-row">
        {cards.map((card) => <BinderCard key={card.id} card={card} onEdit={() => onEditCard(card)} setConfig={setConfig} />)}
      </div>
    </section>
  );
}

function BinderCard({ card, onEdit, setConfig }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const background = getCoverStyle(card);

  async function uploadFiles(event) {
    const files = [...event.target.files];
    if (!files.length) return;
    const form = new FormData();
    files.forEach((file) => form.append('torrents', file));
    setUploading(true);
    try {
      await axios.post(`/api/cards/${card.id}/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  return (
    <article className="binder-card" style={background}>
      <input ref={inputRef} type="file" multiple accept=".torrent,application/x-bittorrent" onChange={uploadFiles} hidden />
      <button className="card-settings" title="卡片设置" onClick={onEdit}><Settings /></button>
      <div className="card-content">
        <FolderDown />
        <h3>{card.name}</h3>
        <p>{card.savePath || '未设置保存路径'}</p>
        <div className="tag-list small">
          {card.tags.map((tag) => <span key={tag} style={{ background: pickColor(tag) }}>{tag}</span>)}
        </div>
      </div>
      {card.savePath && (
        <button className="upload-overlay" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="spin" /> : <UploadCloud />}
          <span>{uploading ? '上传中' : '添加种子'}</span>
        </button>
      )}
    </article>
  );
}

function getCoverStyle(card) {
  if (card.cover?.type === 'image' && card.cover.value) {
    return { backgroundImage: `linear-gradient(rgba(30,32,42,.12), rgba(30,32,42,.38)), url(${card.cover.value})` };
  }
  const first = pickColor(card.id || card.name, monetColors);
  const second = pickColor(card.name || card.id, accentColors);
  return { background: `linear-gradient(135deg, ${first}, ${second})` };
}

function CardModal({ card, config, setConfig, onClose }) {
  const [draft, setDraft] = useState(card);
  const [tagInput, setTagInput] = useState('');
  const [coverMode, setCoverMode] = useState(card.cover?.type || 'monet');

  const tagHints = useMemo(() => config.tagPool.filter((tag) => !draft.tags.includes(tag)), [config.tagPool, draft.tags]);

  function addTag(value) {
    const next = value.trim();
    if (!next || draft.tags.includes(next)) return;
    setDraft({ ...draft, tags: [...draft.tags, next] });
    setTagInput('');
  }

  async function save() {
    const payload = { ...draft, cover: coverMode === 'monet' ? { type: 'monet', value: '' } : draft.cover };
    const response = await axios.put(`/api/cards/${card.id}`, payload);
    setConfig(response.data);
    onClose();
  }

  function loadLocalCover(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft({ ...draft, cover: { type: 'image', value: reader.result } });
    reader.readAsDataURL(file);
  }

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header>
          <h2>卡片设置</h2>
          <button className="icon-button" onClick={onClose}><X /></button>
        </header>
        <label>卡片名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>保存路径<input value={draft.savePath} placeholder="/downloads/movies" onChange={(event) => setDraft({ ...draft, savePath: event.target.value })} /></label>
        <div className="field-block">
          <span><Tags />种子标签</span>
          <div className="tag-editor">
            {draft.tags.map((tag) => <button key={tag} style={{ background: pickColor(tag) }} onClick={() => setDraft({ ...draft, tags: draft.tags.filter((item) => item !== tag) })}>{tag}<X /></button>)}
            <input value={tagInput} placeholder="输入后回车" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(tagInput); } }} />
          </div>
          <div className="tag-hints">{tagHints.map((tag) => <button key={tag} onClick={() => addTag(tag)}>{tag}</button>)}</div>
        </div>
        <div className="field-block">
          <span><Image />封面显示</span>
          <div className="segmented">
            <button className={coverMode === 'monet' ? 'active' : ''} onClick={() => setCoverMode('monet')}>莫奈配色</button>
            <button className={coverMode === 'image' ? 'active' : ''} onClick={() => setCoverMode('image')}>图片</button>
          </div>
          {coverMode === 'image' && (
            <div className="cover-inputs">
              <input placeholder="图片地址" value={draft.cover?.type === 'image' && !String(draft.cover.value).startsWith('data:') ? draft.cover.value : ''} onChange={(event) => setDraft({ ...draft, cover: { type: 'image', value: event.target.value } })} />
              <label className="file-button">上传图片<input type="file" accept="image/*" onChange={loadLocalCover} hidden /></label>
            </div>
          )}
        </div>
        <button className="primary-button" onClick={save}><Save />保存卡片</button>
      </section>
    </div>
  );
}

export default function App() {
  const { config, setConfig, user, setUser, loading } = useApiState();
  const [view, setView] = useState('cards');

  async function logout() {
    await axios.post('/api/auth/logout');
    setUser(null);
    setConfig(null);
  }

  if (loading) return <div className="loading-screen"><Loader2 className="spin" />qBinder</div>;
  if (!user || !config) return <Login onLogin={({ user: nextUser, config: nextConfig }) => { setUser(nextUser); setConfig(nextConfig); }} />;

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} onLogout={logout} />
      {view === 'cards' ? <CardsPage config={config} setConfig={setConfig} /> : <SettingsPage config={config} setConfig={setConfig} />}
    </div>
  );
}
