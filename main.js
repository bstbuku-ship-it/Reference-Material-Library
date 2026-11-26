/* ═══════════════════════════════════════════════════════
   GLOBAL STATE & CORE UTILS (全局状态与核心工具)
═══════════════════════════════════════════════════════ */
let DB = {
  items: [], categories: [], accounts: [], trash: [], recent: [],
  settings: {
    blockMainland: true, thumbSize: 180, nineCols: '4', nineRatio: '1/1',
    theme: 'auto'
  },
  version: '1.3'
};

/* ═══════════════════════════════════════════════════════
   APP CONFIG (版本与远程更新配置)
═══════════════════════════════════════════════════════ */
const APP_VERSION = '1.5';
// ⬇ 填入你的 GitHub 用户名/仓库名，例如 'buku-lhy/cailiao-ku'
const GITHUB_REPO = 'bstbuku-ship-it/Reference-Material-Library';

// 创作者工作台专属数据隔离池 (workspace.json)
let WS = {
  scripts: [], tasks: [], notes: [], intakes: [], weekly: {},
  order: ['scripts', 'tasks', 'notes', 'intakes', 'weekly'], collapsed: {}
};

let dirHandle = null;
window.blobCache = {}; // 内存 URL 对象缓存池，彻底避免 Base64 代码导致大屏卡顿

// 🆕 v1.5-fix：缓存上限与淘汰。两个缓存各最多保留 300 个 URL，超限时释放最久未用、
// 且当前没有任何 <img> 正在显示的 URL（避免正在看的图被误释放）。
const MAX_BLOB_CACHE = 300;
function _collectInUseBlobUrls() {
  try {
    const set = new Set();
    document.querySelectorAll('img').forEach(im => { const src = im.getAttribute('src'); if (src && src.startsWith('blob:')) set.add(src); });
    return set;
  } catch (e) { return new Set(); }
}
function _evictCacheIfNeeded(cache) {
  const keys = Object.keys(cache);
  if (keys.length <= MAX_BLOB_CACHE) return;
  const inUse = _collectInUseBlobUrls();
  let over = keys.length - MAX_BLOB_CACHE;
  for (const k of keys) {
    if (over <= 0) break;
    const url = cache[k];
    if (inUse.has(url)) continue;
    try { URL.revokeObjectURL(url); } catch (e) {}
    delete cache[k]; over--;
  }
}
// 🆕 v1.5-fix：展示缓存专用写入。只释放展示缓存自己的旧 URL，绝不碰原图缓存
// （此前 setShotBlob 经 revokeShotBlob 会连带释放原图缓存，见审计 A-01）。
function revokeDisplayBlob(id) {
  if (!id) return;
  const url = window.blobCache[id];
  if (url) { try { URL.revokeObjectURL(url); } catch (e) {} delete window.blobCache[id]; }
}
function setDisplayShotBlob(id, fileOrBlob) {
  revokeDisplayBlob(id);
  window.blobCache[id] = URL.createObjectURL(fileOrBlob);
  _evictCacheIfNeeded(window.blobCache);
  return window.blobCache[id];
}

// 修复：blobCache 内存泄漏治理 —— 统一的 Object URL 释放入口
// 任何"永久性"丢弃某个 shot.id 对应的图片资源时都必须调用，避免 URL.createObjectURL 泄漏内存
function revokeShotBlob(id) {
  if (!id) return;
  const url = window.blobCache[id];
  if (url) { try { URL.revokeObjectURL(url); } catch(e) {} delete window.blobCache[id]; }
  revokeOrigBlob(id); // 🆕 v1.5：原图缓存也要一并释放，避免内存泄漏
}
function revokeItemBlobs(item) {
  if (!item || !item.shots) return;
  item.shots.forEach(s => revokeShotBlob(s.id));
}
// 重新生成某 id 的 Object URL 前，先释放旧的引用，避免同一 id 反复覆盖造成的悬空泄漏
function setShotBlob(id, fileOrBlob) {
  // 🆕 v1.5-fix：只释放展示缓存，不再连带释放原图缓存（见 A-01）。
  // 永久丢弃某张图时请用 revokeShotBlob()（同时释放两边）。
  const url = setDisplayShotBlob(id, fileOrBlob);
  return url;
}

let selectedId = null, currentFilter = { type: 'all' }, currentView = 'lib';
let saveTimer = null;
let editingItemId = null, formTags = [], ctxCatId = null, ctxCardId = null, ctxCardImgId = null;

// 高级交互与画廊多选缓存
let trashSelectedIds = new Set();
let galleryShots = [], galleryIndex = 0, currentNineGridItemId = null, galleryItemId = null;
let nineGridSelectedIds = new Set(), nineLastClickedIdx = -1;
let nineCtxCurrentIdx = -1; // 记录右键点击的是九宫格的哪张图

// 视觉颜色标签算法分配
const TAG_PALETTE = [
  ['#EAF3DE','#3B6D11'],['#FAEEDA','#854F0B'],['#E6F1FB','#185FA5'],
  ['#FBEAF0','#993556'],['#EEEDFE','#534AB7'],['#E5F8F1','#0D6E4A'],
  ['#FFF3E0','#7C4400'],['#F0F4FF','#2D3F8B']
];
let tagColorMap = {}, tagColorIdx = 0;
function tagColor(t) { if(!tagColorMap[t]) tagColorMap[t] = TAG_PALETTE[tagColorIdx++ % TAG_PALETTE.length]; return tagColorMap[t]; }
function tagHtml(t, q) { const [bg,fc] = tagColor(t); const label = q ? highlightMatch(t, q) : escapeHtml(t); return `<span class="tag" style="background:${bg};color:${fc}">${label}</span>`; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function sanitizeName(n) { return (n||'未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30); }
function pad2(n) { return String(n).padStart(2,'0'); }

// 🆕 v1.5-fix：HTML 转义。所有拼进 innerHTML / HTML 属性的用户数据都必须过它，
// 否则标题里的引号会跳出属性、注入 data-act 等属性被 dispatcher 当成 handler 执行。
function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// 🆕 v1.5-fix：安全 JSON 解析。丢弃 __proto__/constructor/prototype 键，
// 防止外部备份文件借 Object.assign 替换 DB/WS 自身的原型。
function safeJsonParse(text) {
  return JSON.parse(text, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype') ? undefined : v);
}
// 🆕 v1.5-fix：搜索防抖。输入时只重置计时器，停 180ms 后才重渲染网格。
let _searchRenderTimer = null;
function scheduleLibrarySearchRender() {
  clearTimeout(_searchRenderTimer);
  _searchRenderTimer = setTimeout(() => { if (typeof renderLibraryGrid === 'function') renderLibraryGrid(); }, 180);
}
// 搜索框一键清空：有字才显示右端小叉，没字就藏起来
function updateSearchClearBtn() {
  const inp = document.getElementById('search');
  const wrap = document.getElementById('search-wrap');
  const btn = document.getElementById('search-clear');
  if (!inp || !wrap || !btn) return;
  const has = inp.value.trim().length > 0;
  btn.classList.toggle('show', has);
  wrap.classList.toggle('has-text', has);
}
function dateStr8(ts) { const d = new Date(ts||Date.now()); return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`; }
// 生成可读的物理文件名：素材名_日期_序号.扩展名（新规则，替代原先纯随机 ID 命名）
function buildShotFileName(item, shot, seq) {
  return `${sanitizeName(item.title)}_${dateStr8(shot.addedAt)}_${pad2(seq)}.${shot.ext||'jpg'}`;
}
// 兼容旧数据：若 shot 尚未有可读文件名，则回退到旧的 id.ext 命名
function shotFileName(shot) { return shot.fileName || `${shot.id}.${shot.ext||'jpg'}`; }
// 回收站内文件始终使用 id 命名，避免不同素材间可读文件名重复冲突
function shotTrashFileName(shot) { return `${shot.id}.${shot.ext||'jpg'}`; }
// 目录/素材/分类命名重复检测
function isDuplicateCategoryName(name, excludeId) {
  const n = name.trim().toLowerCase();
  return DB.categories.some(c => c.id !== excludeId && c.name.trim().toLowerCase() === n);
}
function isDuplicateItemTitle(title, categoryId, excludeId) {
  const t = title.trim().toLowerCase();
  return DB.items.some(it => it.id !== excludeId && it.categoryId === categoryId && (it.title||'').trim().toLowerCase() === t);
}

// 全局微提示气泡
function showToast(msg, type='success', opts) {
  opts = opts || {};
  const severe = opts.severe === true || type === 'error'; // 🆕 v1.3：错误类默认视为严重提示，额外多停留 2 秒
  const duration = 2900 + (severe ? 2000 : 0);
  const c = document.getElementById('toast-container');
  // 🆕 v1.3：同时最多保留 4 条气泡，超出时把最旧的挤掉，避免连续报错时气泡无限堆叠
  const existing = c.querySelectorAll('.toast');
  if (existing.length >= 4) existing[0].remove();
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<i class="ti ${type==='error'?'ti-alert-circle':type==='warning'?'ti-alert-triangle':'ti-check'}"></i> ${escapeHtml(msg)}`;
  c.appendChild(t); setTimeout(()=>t.remove(), duration);
}

/* ═══════════════════════════════════════════════════════
   LINK PARSING & CORS HANDLING (外网智能提取解析)
═══════════════════════════════════════════════════════ */
const PLATFORMS = {
  facebook: { key:'FB', bg:'#DBEAFE', color:'#1E40AF', icon:'ti-brand-facebook' },
  instagram: { key:'IG', bg:'#FCE7F3', color:'#9D174D', icon:'ti-brand-instagram' },
  youtube: { key:'YT', bg:'#FEE2E2', color:'#991B1B', icon:'ti-brand-youtube' },
  pinterest: { key:'PIN', bg:'#FFE9EB', color:'#E60023', icon:'ti-brand-pinterest' },
  web: { key:'WEB', bg:'#F3F4F6', color:'#374151', icon:'ti-link' }
};

function isBlockedPlatform(s) {
  if (DB.settings && DB.settings.blockMainland === false) return false;
  return /tiktok\.com|vm\.tiktok|vt\.tiktok|douyin\.com|weibo\.com|bilibili\.com|b23\.tv|xiaohongshu\.com|xhslink\.com|kuaishou\.com|ixigua\.com/i.test(s);
}

function detectPlatform(url) {
  if (/facebook\.com|fb\.com|fb\.watch/i.test(url)) return PLATFORMS.facebook;
  if (/instagram\.com/i.test(url)) return PLATFORMS.instagram;
  if (/youtube\.com|youtu\.be/i.test(url)) return PLATFORMS.youtube;
  if (/pinterest\.com|pin\.it/i.test(url)) return PLATFORMS.pinterest;
  return PLATFORMS.web;
}

function isVideoLink(url) { 
  return /\/(reel|reels|watch|shorts|p)(\/|\?|$)/i.test(url) || /youtu\.be/i.test(url); 
}

function extractNameFromUrl(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://'+url);
    const parts = u.pathname.split('/').filter(Boolean);
    if(isVideoLink(url)) return parts[0] && !['reel','reels','watch','shorts','p'].includes(parts[0]) ? parts[0] : '关联视频源';
    return parts.pop() || u.hostname;
  } catch { return url; }
}

/* ═══════════════════════════════════════════════════════
   FILE SYSTEM ACCESS API (本地物理硬盘文件引擎)
═══════════════════════════════════════════════════════ */
// 利用底层 indexedDB 永久记忆用户授权过的盘符路径
const FsStore = {
  _dbPromise: null,
  async init() {
    // 🆕 v1.5-fix：缓存 IndexedDB 连接，不再每次 get/set 都重新 open；
    // open 出错/被阻塞时返回 null，不再让调用方无限挂起（见 A-11）。
    if (!this._dbPromise) {
      this._dbPromise = new Promise(r => {
        try {
          const req = indexedDB.open('LHY_FS_V3', 1);
          req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
          req.onsuccess = e => r(e.target.result);
          req.onerror = () => r(null);
          req.onblocked = () => r(null);
        } catch (e) { r(null); }
      });
    }
    return this._dbPromise;
  },
  async get(k) { const db = await this.init(); if (!db) return null; return new Promise(r => { const req = db.transaction('kv','readonly').objectStore('kv').get(k); req.onsuccess = e => r(e.target.result); req.onerror = () => r(null); }); },
  async set(k, v) { const db = await this.init(); if (!db) return; return new Promise(r => { try { const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => r(); tx.onerror = () => r(); } catch (e) { r(); } }); }
};

// 递归穿透读取目标物理文件夹
async function getDirHandleByPath(baseHandle, path, create = false) {
  let curr = baseHandle;
  for (const part of path.split('/').filter(Boolean)) { 
    try { curr = await curr.getDirectoryHandle(part, { create }); } 
    catch (e) { return null; } 
  }
  return curr;
}

// 基于素材名称和ID动态生成物理存储路径
function getItemFolderPath(item) {
  const cat = DB.categories.find(c => c.id === item.categoryId);
  return `素材截图/${sanitizeName(cat ? cat.name : '未分类')}/${sanitizeName(item.title)}_${item.id}`;
}

async function chooseFolder() {
  if (!('showDirectoryPicker' in window)) { showToast('当前浏览器内核过旧，不支持直接读写本地硬盘，请使用电脑端的 Chrome 或 Edge 浏览器', 'error'); return; }
  try {
    dirHandle = await window.showDirectoryPicker({ mode:'readwrite' });
    await FsStore.set('root_dir', dirHandle);
    await setupWorkspace();
    showToast('✅ 成功接管本地硬盘数据目录！', 'success');
  } catch(e) {}
}

async function setupWorkspace() {
  // 静默建立基建目录体系
  await getDirHandleByPath(dirHandle, '素材截图', true);
  await getDirHandleByPath(dirHandle, '已删除（回收站）', true);
  
  const fIcon = document.getElementById('folder-icon');
  if(fIcon) fIcon.className = 'ti ti-folder-check';
  const fText = document.getElementById('folder-status-text');
  if(fText) {
    fText.textContent = dirHandle.name;
    fText.style.color = 'var(--tx)';
  }
  
  const fBanner = document.getElementById('folder-banner');
  if(fBanner) fBanner.style.display = 'none';
  
  const setPath = document.getElementById('set-folder-path');
  if(setPath) setPath.textContent = dirHandle.name;
  
  await loadFromFolder();
  computeAndRenderDiskUsage(); // 🆕 v1.3：连接成功后异步统计一次本地占用空间，不阻塞主流程
  runTrashAutoCleanIfNeeded(); // 🆕 v1.4：按用户在设置里配置的保留天数/体积上限，静默清理过期回收站内容（默认关闭，不影响没开启的人）
}

// 🆕 v1.3：递归统计已连接文件夹的总占用空间，GB/MB 自动切换单位（不满 1GB 显示 MB）
function formatBytesAuto(bytes) {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return gb.toFixed(2) + ' GB';
  const mb = bytes / (1024 ** 2);
  return mb.toFixed(1) + ' MB';
}
async function getDirSizeRecursive(handle, includeThumbs = false) {
  let total = 0;
  for await (const entry of handle.values()) {
    // 🆕 v1.5-fix：默认不统计 .thumbs 缩略图目录（它是原图的派生缓存，计入会重复计费）；
    // 清理记账等需要真实占用时传 includeThumbs=true。
    if (!includeThumbs && entry.kind === 'directory' && entry.name === '.thumbs') continue;
    if (entry.kind === 'file') {
      try { const f = await entry.getFile(); total += f.size; } catch (e) {}
    } else if (entry.kind === 'directory') {
      try { total += await getDirSizeRecursive(entry, includeThumbs); } catch (e) {}
    }
    // 🆕 v1.5-fix：每处理 500 个条目让出一次主线程，避免大库统计时界面长时间卡死。
    _dirSizeYieldCount++;
    if (_dirSizeYieldCount % 500 === 0) await new Promise(r => setTimeout(r, 0));
  }
  return total;
}
let _dirSizeYieldCount = 0;
let _diskUsageComputing = false;
let _diskUsageCache = { bytes: 0, at: 0 };
const DISK_USAGE_CACHE_MS = 5 * 60 * 1000; // 🆕 v1.5-fix：磁盘占用统计缓存 5 分钟，手动刷新可绕过（见 A-08）
async function computeAndRenderDiskUsage(force = false) {
  if (!dirHandle || _diskUsageComputing) return;
  const el = document.getElementById('disk-usage-text');
  if (!force && _diskUsageCache.at && Date.now() - _diskUsageCache.at < DISK_USAGE_CACHE_MS) {
    if (el) el.textContent = formatBytesAuto(_diskUsageCache.bytes);
    return;
  }
  _diskUsageComputing = true;
  if (el) el.textContent = '统计中...';
  try {
    const bytes = await getDirSizeRecursive(dirHandle);
    _diskUsageCache = { bytes, at: Date.now() };
    if (el) el.textContent = formatBytesAuto(bytes);
    maybeSuggestThumbs(bytes); // 🆕 2026-11-26：超过 1GB 且缩略图没开时弹窗建议打开
  } catch (e) {
    if (el) el.textContent = '统计失败';
  } finally {
    _diskUsageComputing = false;
  }
}

// 🆕 2026-11-26：存的资源超过 1GB 时建议打开缩略图（默认关闭）。只在缩略图没开、且用户没点过忽略时弹一次。
const THUMB_SUGGEST_BYTES = 1024 ** 3;
function maybeSuggestThumbs(totalBytes) {
  ensureDefaults();
  if (DB.settings.thumbEnabled) return false;
  if (DB.settings.thumbSuggestDismissed) return false;
  if (!(totalBytes > THUMB_SUGGEST_BYTES)) return false;
  const m = document.getElementById('thumb-suggest-modal');
  if (!m || m.classList.contains('show')) return false;
  m.classList.add('show');
  return true;
}
function enableThumbsFromSuggest() {
  ensureDefaults();
  DB.settings.thumbEnabled = true;
  const el = document.getElementById('set-thumb-enabled');
  if (el) el.className = 'switch on';
  updateThumbQualityRowUI();
  clearDisplayBlobCacheOnly();
  refreshVisibleImagesAfterThumbSettingChange();
  scheduleSave();
  const m = document.getElementById('thumb-suggest-modal');
  if (m) m.classList.remove('show');
  showToast('✅ 缩略图已开启', 'success');
}
function dismissThumbSuggest() {
  ensureDefaults();
  DB.settings.thumbSuggestDismissed = true;
  scheduleSave();
  const m = document.getElementById('thumb-suggest-modal');
  if (m) m.classList.remove('show');
}
// 🆕 2026-11-26：下次再提醒——只关这次弹窗，什么都不记；下次打开插件、第一次算占用时超 1GB 还会再弹
function remindThumbSuggestLater() {
  const m = document.getElementById('thumb-suggest-modal');
  if (m) m.classList.remove('show');
}

async function restoreFolderAccess() {
  const handle = await FsStore.get('root_dir');
  if (!handle) { showToast('未找到上次连接过的文件夹记录，请重新选择/连接文件夹', 'warning'); return; }
  try {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') { dirHandle = handle; await setupWorkspace(); }
    else { showToast('⚠️ 未获得文件夹访问授权，可能是在浏览器弹窗里点了拒绝，请重新点击"恢复连接"并在弹窗中选择允许', 'warning'); }
  } catch(e) {
    showToast('⚠️ 恢复连接失败，请尝试重新点击"选择/连接文件夹"手动连接', 'error');
  }
}

async function loadFromFolder() {
  try {
    const fh = await getDirHandleByPath(dirHandle, '', false);
    if (fh) {
      // 提取核心母库
      const dbFile = await fh.getFileHandle('database.json', { create: false }).catch(()=>null);
      if (dbFile) {
        try {
          DB = Object.assign(DB, safeJsonParse(await (await dbFile.getFile()).text()));
        } catch(parseErr) {
          showToast('❌ 数据文件解析失败：database.json 格式异常或已损坏，素材可能显示不完整，请检查该文件或恢复备份', 'error');
        }
      }
      // 提取独立创作者工作台
      const wsFile = await fh.getFileHandle('workspace.json', { create: false }).catch(()=>null);
      if (wsFile) {
        try {
          WS = Object.assign(WS, safeJsonParse(await (await wsFile.getFile()).text()));
        } catch(parseErr) {
          showToast('❌ 工作台数据文件解析失败：workspace.json 格式异常或已损坏', 'error');
        }
      }
    }
  } catch(e) { showToast('⚠️ 读取本地文件夹时发生异常，部分数据可能未能加载', 'error'); }
  
  // 安全阀保护：结构兼容性防崩溃补全
  if(!DB.accounts) DB.accounts = [];
  if(!DB.recent) DB.recent = [];
  if(!DB.trash || !Array.isArray(DB.trash)) DB.trash = [];
  // 🆕 v1.5-fix：形状兜底。外部文件里的 items/categories 若不是数组，后续渲染会崩溃（见 A-12）。
  if(!Array.isArray(DB.items)) DB.items = [];
  if(!Array.isArray(DB.categories)) DB.categories = [];
  if(!WS.order) WS.order = ['scripts', 'tasks', 'notes', 'intakes', 'weekly'];
  if(!WS.collapsed) WS.collapsed = {};

  await migrateLegacyBase64();
  // 🆕 v1.5：不再开机就预加载全库原图（见上方"图片按需加载引擎"注释），主页/九宫格/回收站各自按需加载
  
  ensureDefaults(); applySettings();

  // 2026-11-26：PIN 锁屏功能已完整删除，直接进入大库界面。
  switchView('lib');
}

// 自动静默任务：清洗老 JSON 里的 Base64 图片残骸并写成硬盘上的真实 JPG
async function migrateLegacyBase64() {
  if (!dirHandle) return;
  let migrated = false;
  for (const item of DB.items) {
    if (!item.shots) continue;
    let itemDir = null;
    for (const shot of item.shots) {
      if (shot.dataUrl && shot.dataUrl.startsWith('data:image')) {
        if (!itemDir) itemDir = await getDirHandleByPath(dirHandle, getItemFolderPath(item), true);
        const match = /^data:(image\/\w+);base64,(.+)$/.exec(shot.dataUrl);
        if (match) {
          shot.ext = match[1].split('/')[1].replace('jpeg', 'jpg');
          // 安全审计 2026-11-26（S-06）：atob 在 try 外面，备份里一段坏 base64 会抛错、中断整个迁移，
          // 坏 dataUrl 还留在库里。解码失败说明这段数据已损坏、无法恢复，直接清掉；写文件失败则保留 dataUrl。
          let bytes = null;
          try { bytes = atob(match[2]); } catch (e) { bytes = null; }
          if (bytes === null) { delete shot.dataUrl; migrated = true; continue; }
          const array = new Uint8Array(bytes.length);
          for (let i=0; i<bytes.length; i++) array[i] = bytes.charCodeAt(i);
          try {
            const fh = await itemDir.getFileHandle(`${shot.id}.${shot.ext}`, { create: true });
            const w = await fh.createWritable(); await w.write(array); await w.close();
            setShotBlob(shot.id, new Blob([array], { type: match[1] }));
            delete shot.dataUrl; migrated = true;
          } catch(e) {}
        }
      }
    }
  }
  if (migrated) scheduleSave();
}

// 运行时性能优化：提取物理硬盘文件建立高速内存映射网（告别网页卡顿）
// 修复5：文件夹关联自愈 —— 素材改名后如果物理文件夹曾经因为旧版本逻辑未能同步改名，
// 这里按素材 id 后缀（文件夹命名规则固定为 "标题_id"，id 不会变）反向扫描分类目录找回文件夹，
// 找到后立即把物理文件夹改名为当前标题对应的规范路径，此后即可正常直接命中，无需再次扫描
async function findAndHealItemDir(item) {
  if (!dirHandle) return null;
  const cat = DB.categories.find(c => c.id === item.categoryId);
  const catPath = `素材截图/${sanitizeName(cat ? cat.name : '未分类')}`;
  const catDir = await getDirHandleByPath(dirHandle, catPath, false);
  if (!catDir) return null;
  const suffix = `_${item.id}`;
  try {
    for await (const [name, handle] of catDir.entries()) {
      if (handle.kind === 'directory' && name.endsWith(suffix)) {
        const canonicalName = `${sanitizeName(item.title)}_${item.id}`;
        if (name !== canonicalName) {
          const ok = await moveFs(dirHandle, `${catPath}/${name}`, `${catPath}/${canonicalName}`, false);
          if (ok) return await getDirHandleByPath(dirHandle, `${catPath}/${canonicalName}`, false);
        }
        return handle;
      }
    }
  } catch(e) {}
  return null;
}

// ═══════════════════════════════════════════════════════
// 🆕 v1.5：图片按需加载引擎（懒加载 + 可选缩略图），替换掉原来开机就把全库原图读进内存的 preloadImageBlobs()。
// 现在：① 主页卡片只在滚动到视野附近才读封面图；② 打开某个素材夹子（九宫格）时只读它自己的图；
// ③ 回收站只在真正打开回收站视图时才读；④ 开启了"缩略图"设置的话，以上场景读到的都是缩小压缩过的
// 缩略图（会缓存一份到磁盘 .thumbs 子文件夹，下次不用重新生成），原图只在真正需要原图质量的场景
// （放大查看 / 导出 / 复制 / 保存）才现读现解码，不会因为生成缩略图而把原图也一起长期留在内存里。
// ═══════════════════════════════════════════════════════
window.origBlobCache = {}; // 原图 Blob URL 缓存，只在真正需要原图质量时才填充
function revokeOrigBlob(id) {
  if (!id) return;
  const url = window.origBlobCache[id];
  if (url) { try { URL.revokeObjectURL(url); } catch (e) { } delete window.origBlobCache[id]; }
}
function setOrigShotBlob(id, fileOrBlob) {
  revokeOrigBlob(id);
  window.origBlobCache[id] = URL.createObjectURL(fileOrBlob);
  _evictCacheIfNeeded(window.origBlobCache);
  return window.origBlobCache[id];
}

const THUMB_CARD_WIDTH = 220; // 主页卡片缩略图宽度
const THUMB_NINE_WIDTH = 480; // 九宫格缩略图宽度，比卡片宽一截，细节保留更多（"质量高一些"）

async function getItemDirHandleSafe(item) {
  let itemDir = await getDirHandleByPath(dirHandle, getItemFolderPath(item), false);
  if (!itemDir) itemDir = await findAndHealItemDir(item);
  return itemDir;
}
async function getShotFileHandle(dir, shot) {
  try { return await dir.getFileHandle(shotFileName(shot)); }
  catch (e) { try { return await dir.getFileHandle(`${shot.id}.${shot.ext || 'jpg'}`); } catch (e2) { return null; } }
}
async function getTrashDirHandleForEntry(t) {
  if (t.type === 'item') return await getDirHandleByPath(dirHandle, `已删除（回收站）/${sanitizeName(t.data.title)}_${t.data.id}`, false);
  return await getDirHandleByPath(dirHandle, '已删除（回收站）', false);
}
async function getTrashShotFileHandle(dir, shot, isItemType) {
  try { return await dir.getFileHandle(isItemType ? shotFileName(shot) : shotTrashFileName(shot)); }
  catch (e) { try { return await dir.getFileHandle(`${shot.id}.${shot.ext || 'jpg'}`); } catch (e2) { return null; } }
}

// 读原图：放大查看 / 导出 / 复制 / 保存都走这个，保证拿到没压缩过的真实原图
async function ensureOriginalBlob(item, shot) {
  if (!shot || shot.type === 'reel') return null;
  if (window.origBlobCache[shot.id]) return window.origBlobCache[shot.id];
  if (!dirHandle || !item) return null;
  const dir = await getItemDirHandleSafe(item);
  if (!dir) return null;
  const fh = await getShotFileHandle(dir, shot);
  if (!fh) return null;
  return setOrigShotBlob(shot.id, await fh.getFile());
}
async function ensureOriginalBlobTrash(trashEntry, shot) {
  if (!shot || shot.type === 'reel') return null;
  if (window.origBlobCache[shot.id]) return window.origBlobCache[shot.id];
  if (!dirHandle) return null;
  const dir = await getTrashDirHandleForEntry(trashEntry);
  if (!dir) return null;
  const fh = await getTrashShotFileHandle(dir, shot, trashEntry.type === 'item');
  if (!fh) return null;
  return setOrigShotBlob(shot.id, await fh.getFile());
}

// 🆕 v1.5-fix2：把“原图文件 -> JPEG 缩略图 Blob”的生成逻辑抽成独立 helper，
// 主库与回收站共用同一套生成与兜底（见“回收站缩略图”）。
async function makeThumbBlob(srcFile, width, quality) {
  try {
    // 解码期直接降采样，避免先全尺寸解码再缩小造成的内存峰值；
    // 不支持 resize 选项的格式回退到全尺寸解码。
    let bitmap;
    try { bitmap = await createImageBitmap(srcFile, { resizeWidth: width, resizeQuality: 'high' }); }
    catch (e) { bitmap = await createImageBitmap(srcFile); }
    // 小图不放大：目标宽只往小取，避免把小图强行放大存进缩略图。
    const w = Math.max(1, Math.min(width, bitmap.width));
    const h = Math.max(1, Math.round(w * (bitmap.height / bitmap.width)));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close(); // 解码用的位图立刻释放——这是能省内存的关键，不会因为生成缩略图而把原图长期留在内存里
    return await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  } catch (e) {
    return null;
  }
}

// 生成/读取展示用图片（受"缩略图"设置控制），用于卡片网格、九宫格、封面预览等所有"浏览"场景
async function ensureDisplayBlob(item, shot, kind) {
  if (!shot || shot.type === 'reel') return null;
  if (window.blobCache[shot.id]) return window.blobCache[shot.id];
  ensureDefaults();
  if (!dirHandle || !item) return null;
  const dir = await getItemDirHandleSafe(item);
  if (!dir) return null;
  const srcFh = await getShotFileHandle(dir, shot);
  if (!srcFh) return null;
  const srcFile = await srcFh.getFile();

  if (!DB.settings.thumbEnabled) {
    // 🆕 v1.5-fix：缩略图关闭时，展示缓存与原图缓存各持一份独立的 Object URL，
    // 绝不共用同一个 URL（此前共用导致切设置后原图缓存指向已释放 URL，见 A-01）。
    setOrigShotBlob(shot.id, srcFile);
    return setDisplayShotBlob(shot.id, srcFile);
  }

  const quality = DB.settings.thumbQuality || 1;
  const width = kind === 'nine' ? THUMB_NINE_WIDTH : THUMB_CARD_WIDTH;
  // 🆕 v1.5-fix：缓存名带上源文件的大小与修改时间，源文件在磁盘上被替换后旧缩略图不再被误用（见 A-07）。
  const fingerprint = `${srcFile.size}_${srcFile.lastModified || 0}`;
  const cacheName = `${shot.id}_${kind}_q${Math.round(quality * 100)}_${fingerprint}.jpg`;
  const thumbDir = await getDirHandleByPath(dirHandle, `${getItemFolderPath(item)}/.thumbs`, true);

  // 磁盘上已经缓存过这一档参数的缩略图了，直接读出来用，不用重新生成
  if (thumbDir) {
    try {
      const cachedFh = await thumbDir.getFileHandle(cacheName, { create: false });
      return setShotBlob(shot.id, await cachedFh.getFile());
    } catch (e) { /* 还没生成过，往下走生成流程 */ }
  }

  try {
    const thumbBlob = await makeThumbBlob(srcFile, width, quality);
    if (!thumbBlob) return setShotBlob(shot.id, srcFile); // 生成失败兜底：直接显示原图，不让格子空着
    if (thumbDir) {
      try {
        const w2 = await (await thumbDir.getFileHandle(cacheName, { create: true })).createWritable(); await w2.write(thumbBlob); await w2.close();
        // 清掉同一张图同一场景下的旧指纹缓存，避免 .thumbs 里越攒越多
        try {
          for await (const [n, h2] of thumbDir.entries()) {
            if (h2.kind === 'file' && n.startsWith(`${shot.id}_${kind}_`) && n !== cacheName) await thumbDir.removeEntry(n).catch(() => {});
          }
        } catch (e) {}
      } catch (e) { }
    }
    return setShotBlob(shot.id, thumbBlob);
  } catch (e) {
    return setShotBlob(shot.id, srcFile); // 解码失败兜底（极少数损坏文件）：直接用原图，不因为缩略图失败导致图片完全不显示
  }
}

async function ensureDisplayBlobTrash(trashEntry, shot) {
  // 🆕 v1.5-fix2：回收站封面也走缩略图缓存（此前直接读原图）。回收站条目尚未真正
  // 物理删除，封面必须可见；缩略图存在该条目自己的文件夹（item 型）或回收站根目录
  // （shot 型）下的 .thumbs/ 里，恢复/彻底删除时随条目一起处理。
  if (!shot || shot.type === 'reel') return null;
  if (window.blobCache[shot.id]) return window.blobCache[shot.id];
  ensureDefaults();
  if (!dirHandle) return null;
  const dir = await getTrashDirHandleForEntry(trashEntry);
  if (!dir) return null;
  const fh = await getTrashShotFileHandle(dir, shot, trashEntry.type === 'item');
  if (!fh) return null;
  const srcFile = await fh.getFile();

  if (!DB.settings.thumbEnabled) {
    // 与主库一致：展示缓存与原图缓存各持一份独立 URL，绝不共用（见 A-01）。
    setOrigShotBlob(shot.id, srcFile);
    return setDisplayShotBlob(shot.id, srcFile);
  }

  const quality = DB.settings.thumbQuality || 1;
  const width = THUMB_CARD_WIDTH;
  const fingerprint = `${srcFile.size}_${srcFile.lastModified || 0}`;
  const cacheName = `${shot.id}_card_q${Math.round(quality * 100)}_${fingerprint}.jpg`;
  const folderPath = trashEntry.type === 'item'
    ? `已删除（回收站）/${sanitizeName(trashEntry.data.title)}_${trashEntry.data.id}`
    : '已删除（回收站）';
  const thumbDir = await getDirHandleByPath(dirHandle, `${folderPath}/.thumbs`, true);

  if (thumbDir) {
    try {
      const cachedFh = await thumbDir.getFileHandle(cacheName, { create: false });
      return setShotBlob(shot.id, await cachedFh.getFile());
    } catch (e) { /* 还没生成过，往下走生成流程 */ }
  }

  try {
    const thumbBlob = await makeThumbBlob(srcFile, width, quality);
    if (!thumbBlob) return setShotBlob(shot.id, srcFile);
    if (thumbDir) {
      try {
        const w2 = await (await thumbDir.getFileHandle(cacheName, { create: true })).createWritable(); await w2.write(thumbBlob); await w2.close();
        try {
          for await (const [n, h2] of thumbDir.entries()) {
            if (h2.kind === 'file' && n.startsWith(`${shot.id}_card_`) && n !== cacheName) await thumbDir.removeEntry(n).catch(() => {});
          }
        } catch (e) {}
      } catch (e) { }
    }
    return setShotBlob(shot.id, thumbBlob);
  } catch (e) {
    return setShotBlob(shot.id, srcFile);
  }
}

// 主页卡片懒加载：只加载"封面图"（首选 pinned，否则第一张非动图），滚动到视野附近才触发
function getItemCoverShot(item) {
  return (item.shots || []).find(s => s.pinned && s.type !== 'reel') || (item.shots || []).find(s => s.type !== 'reel');
}
async function ensureCardCoverLoaded(item) {
  const shot = getItemCoverShot(item);
  if (!shot) return null;
  return await ensureDisplayBlob(item, shot, 'card');
}

// 打开某个素材夹子（九宫格）/ 详情面板时，把它自己的图一次性加载好
const SHOT_LOAD_CONCURRENCY = 4; // 🆕 v1.5-fix：九宫格打开时最多 4 路并发读盘解码，避免 200 张图同时全开（见 A-06）
async function ensureItemDisplayBlobsLoaded(item, kind) {
  if (!item || !item.shots) return;
  const shots = item.shots.filter(s => s.type !== 'reel');
  let next = 0;
  const workers = [];
  for (let w = 0; w < Math.min(SHOT_LOAD_CONCURRENCY, shots.length); w++) {
    workers.push((async () => {
      while (next < shots.length) {
        const s = shots[next++];
        try { await ensureDisplayBlob(item, s, kind); } catch (e) {}
      }
    })());
  }
  await Promise.all(workers);
}


// 修复11：写入并发锁 —— 防止两次异步硬盘写入交叉执行导致"后写覆盖新数据"的竞态问题
// 原则：不阻塞用户操作/UI，只是把写入请求串行化排队，用户完全无感知
let isSaving = false;
let savePending = false;

// 核心主宰：将变更后的虚拟态数据写入硬盘固化
async function saveToFolder() {
  if (isSaving) { savePending = true; return; } // 已有写入在进行中，标记"待再次保存"后直接返回，不产生并发
  isSaving = true;
  try {
    await _doSaveToFolder();
  } finally {
    isSaving = false;
    if (savePending) { savePending = false; saveToFolder(); } // 写入期间又有新变更，自动补一次保存，确保最终一致
  }
}

// 🆕 v1.5-fix：上次成功写盘的文本。内容无变化时跳过写盘，避免每次操作都全量重写两个文件（见 A-08）。
let _lastSavedDbText = null, _lastSavedWsText = null;
async function _doSaveToFolder() {
  // 🆕 v1.5-fix：一次 JSON.stringify + replacer 剥离 dataUrl，不再做两次全量深拷贝
  // （深拷贝只是为了删 dataUrl，replacer 同样效果且不污染内存中的 DB）。
  const stripDataUrl = (k, v) => (k === 'dataUrl' ? undefined : v);
  const dbText = JSON.stringify(DB, stripDataUrl, 2);
  const wsText = JSON.stringify(WS, null, 2);

  if (dirHandle) {
    if (dbText === _lastSavedDbText && wsText === _lastSavedWsText) {
      const st0 = document.getElementById('save-status');
      if (st0) st0.innerHTML = '<i class="ti ti-check"></i> 硬盘同步完成';
      return;
    }
    try {
      const fhDB = await dirHandle.getFileHandle('database.json', { create: true });
      const wDB = await fhDB.createWritable(); await wDB.write(dbText); await wDB.close();

      const fhWS = await dirHandle.getFileHandle('workspace.json', { create: true });
      const wWS = await fhWS.createWritable(); await wWS.write(wsText); await wWS.close();

      _lastSavedDbText = dbText; _lastSavedWsText = wsText;
      const st = document.getElementById('save-status');
      if(st) st.innerHTML = '<i class="ti ti-check"></i> 硬盘同步完成';
      return;
    } catch(e) {
      const st = document.getElementById('save-status');
      if(st) st.innerHTML = '<i class="ti ti-alert-circle"></i> 硬盘写入遇阻';
    }
  }

  // 防御性保底机制（加 try/catch，避免 localStorage 配额超限时无声崩溃）
  if (dbText === _lastSavedDbText && wsText === _lastSavedWsText) return;
  try {
    localStorage.setItem('lhy_v1_db', dbText);
    localStorage.setItem('lhy_v1_ws', wsText);
    _lastSavedDbText = dbText; _lastSavedWsText = wsText;
    const st = document.getElementById('save-status');
    if(st) st.innerHTML = '<i class="ti ti-check"></i> 网页沙盒缓存中';
  } catch(e) {
    const st = document.getElementById('save-status');
    if(st) st.innerHTML = '<i class="ti ti-alert-circle"></i> 沙盒缓存容量已满';
    showToast('⚠️ 网页临时存储容量已满，建议尽快连接本地文件夹进行物理保存', 'error');
  }
}

function scheduleSave() {
  const st = document.getElementById('save-status');
  if(st) st.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> 同步深层存储...';
  clearTimeout(saveTimer); saveTimer = setTimeout(saveToFolder, 800);
}

// 物理引擎：文件搬运工 (用于目录重命名及移入/移出回收站)
// 🆕 v1.5-fix：递归复制目录（含子目录，如 .thumbs），此前只复制顶层文件，
// 改名/进回收站/恢复时会把子目录丢掉（见 A-07）。
async function copyDirRecursive(srcHandle, destHandle) {
  for await (const [n, h] of srcHandle.entries()) {
    if (h.kind === 'file') {
      const w = await (await destHandle.getFileHandle(n, { create: true })).createWritable();
      await w.write(await h.getFile()); await w.close();
    } else if (h.kind === 'directory') {
      await copyDirRecursive(h, await destHandle.getDirectoryHandle(n, { create: true }));
    }
  }
}
async function moveFs(base, srcPath, destPath, isFile = false) {
  const sParts = srcPath.split('/'); const sName = sParts.pop();
  const sDir = await getDirHandleByPath(base, sParts.join('/'), false); if (!sDir) return false;
  const dParts = destPath.split('/'); const dName = dParts.pop();
  const dDir = await getDirHandleByPath(base, dParts.join('/'), true); if (!dDir) return false;
  
  try {
    if (isFile) {
      const w = await (await dDir.getFileHandle(dName, { create: true })).createWritable();
      await w.write(await (await sDir.getFileHandle(sName)).getFile()); await w.close();
      await sDir.removeEntry(sName);
    } else {
      const srcHandle = await sDir.getDirectoryHandle(sName);
      // 【严重bug修复】必须先在目标父目录下创建一个和 dName 同名的子目录，再把文件写进这个子目录里——
      // 之前的写法漏掉了这一步，文件被直接摊平写进了父目录（比如分类目录本身），导致改名后所有图片"找不到"。
      const destHandle = await dDir.getDirectoryHandle(dName, { create: true });
      await copyDirRecursive(srcHandle, destHandle);
      await sDir.removeEntry(sName, { recursive: true }).catch(() => { });
    }
    return true;
  } catch (e) { return false; }
}


function ensureDefaults() {
  // 2026-11-26：分享与画布功能已彻底删除。旧版本升级上来时，把残留的分享记录、密钥、画布项目清掉，下次保存就不再写回（分享从没往本地写过文件，只有数据库里的记录）。
  let _cleanedLegacy = false;
  if (DB.shareHistory) { delete DB.shareHistory; _cleanedLegacy = true; }
  if (DB.settings && (DB.settings.shareApiKey || DB.settings.shareDeviceId)) { delete DB.settings.shareApiKey; delete DB.settings.shareDeviceId; _cleanedLegacy = true; }
  if (DB.canvasProjects) { delete DB.canvasProjects; _cleanedLegacy = true; }
  if (DB.canvasTemplates) { delete DB.canvasTemplates; _cleanedLegacy = true; }
  // 2026-11-26：PIN 锁屏功能已完整删除。旧版本升级上来时，把残留的 PIN 也清掉，下次保存就不再写回。
  if (DB.settings && DB.settings.pin !== undefined) { delete DB.settings.pin; _cleanedLegacy = true; }
  if (_cleanedLegacy) scheduleSave();
  if(document.getElementById('logo-ver')) document.getElementById('logo-ver').textContent = 'v ' + APP_VERSION; // 版本号统一从 APP_VERSION 动态同步，避免手改遗漏
  document.title = '素材参考库 v' + APP_VERSION; // 🆕 v1.3：标签页标题也一并同步，此前一直是写死的 v1.2
  if (!DB.settings) DB.settings = {};
  if (!DB.compareHistory) DB.compareHistory = []; // 兼容旧数据字段（对比模式功能已下线，此处仅防止旧存档报错）
  if (DB.settings.blockMainland === undefined) DB.settings.blockMainland = true;
  if (!DB.settings.thumbSize) DB.settings.thumbSize = 180;
  if (!DB.settings.nineCols) DB.settings.nineCols = '4';
  if (!DB.settings.nineRatio) DB.settings.nineRatio = '1/1';
  if (!DB.settings.theme) DB.settings.theme = 'auto';
  if (!DB.settings.sortMode) DB.settings.sortMode = 'default';
  if (!Array.isArray(DB.settings.searchHistory)) DB.settings.searchHistory = []; // 🆕 v1.3：搜索框最近记录（最多保留 3 条）
  if (!DB.settings.trashAutoClean) DB.settings.trashAutoClean = { enabled: false, days: 30, sizeMB: 0 }; // 🆕 v1.4：回收站自动清理，默认关闭
  if (DB.settings.thumbEnabled === undefined) DB.settings.thumbEnabled = false; // 🆕 2026-11-26：缩略图默认关闭，存的资源超过 1GB 时弹窗建议打开
  if (!DB.settings.thumbQuality) DB.settings.thumbQuality = 1; // 🆕 v1.5：默认质量 1.0（几乎不压缩，只缩小尺寸）
  if (DB.settings.skippedUpdateVersion === undefined) DB.settings.skippedUpdateVersion = ''; // 🆕 v1.5-fix：用户点“暂时忽略”的版本号，见 A-09
  const sortLbl = document.getElementById('sort-btn-label'); if (sortLbl) sortLbl.textContent = SORT_LABELS[DB.settings.sortMode] || '排序方式';
}

// 应用全局系统参数
function applySettings() {
  document.documentElement.style.setProperty('--thumb-min', (DB.settings.thumbSize || 180) + 'px');
  let tTheme = DB.settings.theme;
  if (tTheme === 'auto') tTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.body.className = tTheme;
  document.querySelectorAll('.thm-btn').forEach(b => b.classList.remove('active'));
  if (document.getElementById('thm-' + DB.settings.theme)) document.getElementById('thm-' + DB.settings.theme).classList.add('active');
}

function updateSetting(key, val) {
  ensureDefaults(); DB.settings[key] = val;
  applySettings();
  scheduleSave();
}

function toggleSetting(key) {
  ensureDefaults(); DB.settings[key] = !DB.settings[key];
  if (key === 'blockMainland') {
    const el = document.getElementById('set-block-mainland');
    if (el) el.className = DB.settings[key] ? 'switch on' : 'switch';
  }
  scheduleSave(); showToast(DB.settings[key] ? '规则已开启生效' : '规则已关闭拦截', 'success');
}

function setTheme(mode) { updateSetting('theme', mode); }

// 🆕 v1.5：缩略图设置。改设置后清空当前内存里的展示缓存，让当前看到的画面立刻按新设置刷新
// （不影响 origBlobCache 原图缓存，那份和缩略图设置无关，不用跟着清）。
function clearDisplayBlobCacheOnly() {
  // 🆕 v1.5-fix：释放展示缓存时，若某个原图缓存项存的是同一个 URL（缩略图关闭时的
  // 旧别名写法），必须一并删键，否则原图缓存会指向已释放的 URL（见 A-01）。
  // 新的缩略图关闭分支不再产生别名，这里是给旧会话状态的兜底。
  const revoked = new Set();
  Object.keys(window.blobCache).forEach(id => {
    revoked.add(window.blobCache[id]);
    try { URL.revokeObjectURL(window.blobCache[id]); } catch (e) { }
    delete window.blobCache[id];
  });
  Object.keys(window.origBlobCache).forEach(id => {
    if (revoked.has(window.origBlobCache[id])) delete window.origBlobCache[id];
  });
}

function refreshVisibleImagesAfterThumbSettingChange() {
  if (currentView === 'lib') renderLibraryGrid();
  const nineModal = document.getElementById('nine-grid-modal');
  if (nineModal && nineModal.classList.contains('show') && currentNineGridItemId) {
    const item = DB.items.find(i => i.id === currentNineGridItemId);
    if (item) { renderNineGrid(); ensureItemDisplayBlobsLoaded(item, 'nine').then(() => renderNineGrid()); }
  }
  renderDetailPanel();
}
function toggleThumbEnabled() {
  ensureDefaults();
  DB.settings.thumbEnabled = !DB.settings.thumbEnabled;
  const el = document.getElementById('set-thumb-enabled');
  if (el) el.className = DB.settings.thumbEnabled ? 'switch on' : 'switch';
  updateThumbQualityRowUI();
  clearDisplayBlobCacheOnly();
  refreshVisibleImagesAfterThumbSettingChange();
  scheduleSave();
  showToast(DB.settings.thumbEnabled ? '✅ 缩略图已开启' : '缩略图已关闭（改显示原图，占用和加载耗时会变大）', 'success');
}
function setThumbQuality(v) {
  ensureDefaults();
  DB.settings.thumbQuality = parseFloat(v) || 1;
  clearDisplayBlobCacheOnly();
  refreshVisibleImagesAfterThumbSettingChange();
  scheduleSave();
}
function updateThumbQualityRowUI() {
  const on = DB.settings.thumbEnabled;
  const el = document.getElementById('thumb-quality-row');
  if (el) { el.style.opacity = on ? '1' : '.45'; el.style.pointerEvents = on ? 'auto' : 'none'; }
}

// 🆕 v1.4：回收站自动清理设置
function toggleTrashAutoClean() {
  ensureDefaults();
  if (!DB.settings.trashAutoClean) DB.settings.trashAutoClean = { enabled: false, days: 30, sizeMB: 0 };
  DB.settings.trashAutoClean.enabled = !DB.settings.trashAutoClean.enabled;
  const el = document.getElementById('set-trash-clean-enabled');
  if (el) el.className = DB.settings.trashAutoClean.enabled ? 'switch on' : 'switch';
  updateTrashCleanSubRowsUI();
  scheduleSave();
  showToast(DB.settings.trashAutoClean.enabled ? '✅ 回收站自动清理已开启（下次连接文件夹时生效）' : '回收站自动清理已关闭', 'success');
}
function setTrashCleanDays(v) { ensureDefaults(); DB.settings.trashAutoClean.days = parseInt(v, 10) || 0; scheduleSave(); }
function setTrashCleanSize(v) { ensureDefaults(); DB.settings.trashAutoClean.sizeMB = parseInt(v, 10) || 0; scheduleSave(); }
function updateTrashCleanSubRowsUI() {
  const on = DB.settings.trashAutoClean && DB.settings.trashAutoClean.enabled;
  ['trash-clean-sub-row', 'trash-clean-sub-row2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.opacity = on ? '1' : '.45'; el.style.pointerEvents = on ? 'auto' : 'none'; }
  });
}

function openSettings() {
  ensureDefaults();
  const sbm = document.getElementById('set-block-mainland'); 
  if (sbm) sbm.className = DB.settings.blockMainland ? 'switch on' : 'switch';
  
  syncSettingsThemeSeg();
  let _ver = APP_VERSION;
  try { if (window.chrome && chrome.runtime && chrome.runtime.getManifest) _ver = chrome.runtime.getManifest().version; } catch (e) {}
  if (document.getElementById('set-about-ver')) document.getElementById('set-about-ver').textContent = 'v' + _ver;
  switchSettingsTab('theme');
  if (dirHandle && document.getElementById('set-folder-path')) document.getElementById('set-folder-path').textContent = dirHandle.name;
  
  if (document.getElementById('set-thumb-enabled')) document.getElementById('set-thumb-enabled').className = DB.settings.thumbEnabled ? 'switch on' : 'switch';
  if (document.getElementById('set-thumb-quality')) document.getElementById('set-thumb-quality').value = String(DB.settings.thumbQuality || 1);
  updateThumbQualityRowUI();
  
  const tac = DB.settings.trashAutoClean || { enabled: false, days: 30, sizeMB: 0 };
  if (document.getElementById('set-trash-clean-enabled')) document.getElementById('set-trash-clean-enabled').className = tac.enabled ? 'switch on' : 'switch';
  if (document.getElementById('set-trash-clean-days')) document.getElementById('set-trash-clean-days').value = String(tac.days);
  if (document.getElementById('set-trash-clean-size')) document.getElementById('set-trash-clean-size').value = String(tac.sizeMB);
  updateTrashCleanSubRowsUI();
  
  if(document.getElementById('settings-modal')) document.getElementById('settings-modal').classList.add('show');
}
function closeSettings() { if(document.getElementById('settings-modal')) document.getElementById('settings-modal').classList.remove('show'); }

// 🆕 2026-11-26：设置左侧导航——点导航换一页
function switchSettingsTab(tab) {
  document.querySelectorAll('#settings-modal .set-nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('#settings-modal .set-panel').forEach(el => el.classList.toggle('active', el.id === 'set-panel-' + tab));
}

// 🆕 2026-11-26：设置里主题分段选择（浅色/深色/跟随系统），和旧下拉框同一个值
function setThemeModeSeg(mode) {
  if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') return;
  setTheme(mode);
  syncSettingsThemeSeg();
}
function syncSettingsThemeSeg() {
  document.querySelectorAll('#settings-modal .set-seg-btn').forEach(el => el.classList.toggle('active', el.dataset.mode === DB.settings.theme));
}

// UI 统一卡片图片渲染代理组件
function getShotSrc(shot) { return window.blobCache[shot.id] || shot.dataUrl || ''; }
function getShotImgHtml(shot, styleStr="width:100%;height:100%;object-fit:cover; pointer-events:none;") {
  if (shot.type === 'reel') {
    const ytMatch = shot.url && shot.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^"&?\/\s]{11})/);
    if (ytMatch) {
      return `<div style="position:relative;width:100%;height:100%;"><img src="https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg" style="${styleStr}"><div class="reel-preview-wrap"><i class="ti ti-brand-youtube" style="color:#ef4444"></i></div></div>`;
    }
    return `<div style="position:relative;width:100%;height:100%;background:linear-gradient(135deg,var(--s3),var(--s1));"><div class="reel-preview-wrap"><i class="ti ti-player-play-filled" style="color:var(--tx)"></i></div></div>`;
  }
  const src = window.blobCache[shot.id] || shot.dataUrl;
  // 安全审计 2026-11-26（S-01）：src 直接拼进 <img src="...">，导入的备份文件可借 dataUrl 里的引号跳出属性注入脚本。
  // 只放行本地 blob: 与 data:image:，其余一律不渲染；再转义一次做纵深防御。
  if (src) {
    if (!/^(blob:|data:image\/)/i.test(src)) return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:32px;color:var(--txm);background:var(--s3);${styleStr}"><i class="ti ti-photo-off"></i></div>`;
    return `<img src="${escapeHtml(src)}" style="${styleStr}">`;
  }
  return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:32px;color:var(--txm);background:var(--s3);${styleStr}"><i class="ti ti-photo-off"></i></div>`;
}

/* ═══════════════════════════════════════════════════════
   ROUTING & VIEW SWITCHER (全局视图路由调度器)
═══════════════════════════════════════════════════════ */
// 🆕 v1.5：补全搜索框"最近 3 次记录"功能的实际逻辑（此前只有 HTML/CSS 和默认设置，处理函数一直没写，点了没反应）
function renderSearchHistoryDropdown() {
  const box = document.getElementById('search-history');
  if (!box) return;
  ensureDefaults();
  const hist = DB.settings.searchHistory || [];
  const input = document.getElementById('search');
  const curVal = input ? input.value.trim() : '';
  if (!hist.length || curVal) { box.classList.remove('show'); return; } // 已经在打字了就不用"最近记录"打扰
  box.innerHTML = `<div class="sh-label">最近搜索</div>` + hist.map(h =>
    `<div class="sh-item" data-act="h_pickSearchHistory" data-evt="click" data-act-args="${JSON.stringify([h]).replace(/"/g, "&quot;")}"><i class="ti ti-clock"></i><span>${escapeHtml(h)}</span></div>`
  ).join('');
  box.classList.add('show');
}
function recordSearchHistory(term) {
  term = (term || '').trim();
  if (!term) return;
  ensureDefaults();
  let hist = (DB.settings.searchHistory || []).filter(h => h !== term);
  hist.unshift(term);
  DB.settings.searchHistory = hist.slice(0, 3);
  scheduleSave();
}
function pickSearchHistory(term) {
  const input = document.getElementById('search');
  if (input) input.value = term;
  updateSearchClearBtn();
  if (typeof renderLibraryGrid === 'function') renderLibraryGrid();
  const box = document.getElementById('search-history');
  if (box) box.classList.remove('show');
  recordSearchHistory(term); // 用过的移到最前面
}

function switchView(viewName) {
  currentView = viewName;
  
  document.querySelectorAll('.view-panel').forEach(e => e.classList.remove('active'));
  if(document.getElementById('view-' + viewName)) document.getElementById('view-' + viewName).classList.add('active');
  
  document.querySelectorAll('#sidebar .cat-item').forEach(e => e.classList.remove('active'));
  if (document.querySelector('.nav-' + viewName)) document.querySelector('.nav-' + viewName).classList.add('active');
  else if (viewName === 'trash' && document.getElementById('nav-trash')) document.getElementById('nav-trash').classList.add('active');

  if (viewName === 'lib') { currentFilter = { type: 'all' }; if(typeof renderLibrary === 'function') renderLibrary(); }
  if (viewName === 'trash') { trashSelectedIds.clear(); if(typeof renderTrashView === 'function') renderTrashView(); }
}

function filterByCategory(id, el) {
  currentView = 'lib'; currentFilter = { type: 'category', value: id };
  document.querySelectorAll('.view-panel').forEach(e => e.classList.remove('active'));
  if(document.getElementById('view-lib')) document.getElementById('view-lib').classList.add('active');
  document.querySelectorAll('#sidebar .cat-item').forEach(e => e.classList.remove('active'));
  if(el) el.classList.add('active');
  if(typeof renderLibrary === 'function') renderLibrary();
}

function renderSidebarStats() {
  const items = DB.items;
  const cats = DB.categories;

  // 🆕 v1.5-fix：一次遍历算完各分类计数（此前每个分类都 filter 一遍全库，见 A-05）。
  const counts = new Map();
  items.forEach(it => { counts.set(it.categoryId, (counts.get(it.categoryId) || 0) + 1); });

  const list = document.getElementById('cat-list');
  if(list){
      list.innerHTML = cats.map(c => {
        const cnt = counts.get(c.id) || 0;
        const isAct = currentFilter.type === 'category' && currentFilter.value === c.id;
        return `<div class="cat-item${isAct?' active':''}" data-act="__h101" data-evt="click" data-act-args="${JSON.stringify([c.id]).replace(/"/g, "&quot;")}" data-act2="__h102" data-evt2="contextmenu" data-act-args2="${JSON.stringify([c.id]).replace(/"/g, "&quot;")}"><i class="ti ti-folder"></i><span class="cat-name">${escapeHtml(c.name)}</span><span class="cat-count">${cnt}</span></div>`;
      }).join('');
  }

  if (document.getElementById('count-trash')) document.getElementById('count-trash').textContent = DB.trash.length;
}

/* ═══════════════════════════════════════════════════════
   VIEW 1: LIBRARY (素材大库渲染与控制器)
═══════════════════════════════════════════════════════ */
function renderLibrary() {
  renderSidebarStats();
  
  let title = '全部素材展示';
  if (currentFilter.type === 'category') title = ((DB.categories).find(x => x.id === currentFilter.value) || {}).name || '孤岛分类';
  
  if(document.getElementById('main-title')) document.getElementById('main-title').textContent = title;
  
  renderLibraryGrid(); 
}

function renderLibraryGrid() {
  let items = DB.items;
  const sInput = document.getElementById('search');
  const q = sInput ? sInput.value.toLowerCase().trim() : '';
  
  if (q) items = items.filter(it => (it.title||'').toLowerCase().includes(q) || (it.tags||[]).some(t => t.toLowerCase().includes(q)) || (it.links||[]).some(l=>l.url.toLowerCase().includes(q) || (l.name||'').toLowerCase().includes(q)));
  if (currentFilter.type === 'category') items = items.filter(it => it.categoryId === currentFilter.value);
  items = sortItemsList(items, DB.settings.sortMode || 'default');

  // 🆕 v1.5-fix2：无限滚动。过滤条件/搜索词/排序变化时重置为第一页（60 张），
  // 滚到底部自动追加下一页；全部过滤结果仍记在 libDisplayedIds 里供区间多选使用。
  const signature = `${q}|${currentFilter.type}:${currentFilter.value}|${DB.settings.sortMode || 'default'}`;
  if (signature !== libFilterSignature) { libFilterSignature = signature; libVisibleLimit = LIB_PAGE_SIZE; }
  libFilteredCount = items.length;
  const visibleItems = items.slice(0, libVisibleLimit);
  
  if(document.getElementById('main-count')) document.getElementById('main-count').textContent = items.length + ' 项独立档案';
  
  const grid = document.getElementById('grid'), emp = document.getElementById('empty-state'), gate = document.getElementById('folder-gate-state');

  // 核心要求：未连接文件夹时，主界面居中强制显示"请先连接文件夹"引导，替代原有空状态创建面板
  if (!dirHandle) {
    if(grid) grid.innerHTML = '';
    if(emp) emp.style.display = 'none';
    if(gate) {
      gate.style.display = 'flex';
      const hasSavedHandle = !!document.getElementById('btn-restore-folder') && document.getElementById('btn-restore-folder').style.display !== 'none';
      if(document.getElementById('btn-gate-restore-folder')) document.getElementById('btn-gate-restore-folder').style.display = hasSavedHandle ? 'flex' : 'none';
      if(document.getElementById('btn-gate-choose-folder')) document.getElementById('btn-gate-choose-folder').style.display = hasSavedHandle ? 'none' : 'flex';
    }
    if(document.getElementById('detail')) document.getElementById('detail').style.display = 'none';
    return;
  }
  if(gate) gate.style.display = 'none';

  if (!items.length) { 
    if(grid) grid.innerHTML = ''; 
    if(emp) emp.style.display = 'flex'; 
    if(document.getElementById('detail')) document.getElementById('detail').style.display = 'none'; 
    return; 
  }
  
  if(emp) emp.style.display = 'none'; 
  if(document.getElementById('detail')) document.getElementById('detail').style.display = 'flex';
  
  libDisplayedIds = items.map(it => it.id); // 供 shift 区间多选使用

  if(grid) {
    grid.innerHTML = visibleItems.map(it => {
      const pinned = (it.shots||[]).find(s=>s.pinned) || (it.shots||[])[0];
      const isVid = pinned && pinned.type === 'reel';
      const thHtml = pinned ? getShotImgHtml(pinned) : `<i class="ti ti-photo" style="font-size:36px;color:var(--txm)"></i>`;
      const reelOverlay = isVid && pinned.url.match(/youtu/) ? '' : (isVid ? `<div class="reel-preview-wrap"><i class="ti ti-player-play-filled"></i></div>` : '');
      
      // 🆕 v1.4：命中搜索关键字时，把标题/标签里匹配到的片段高亮出来，方便一眼定位
      const displayTitle = q ? highlightMatch(it.title || '尚未命名', q) : (it.title || '尚未命名');

      return `<div class="card${selectedId === it.id ? ' selected' : ''}${libSelectedIds.has(it.id) ? ' multi-selected' : ''}" draggable="true" data-id="${it.id}"
        data-act="__h103" data-evt="click" data-act-args="${JSON.stringify([it.id]).replace(/"/g, "&quot;")}" data-act2="__h104" data-evt2="dblclick" data-act-args2="${JSON.stringify([it.id]).replace(/"/g, "&quot;")}" data-act3="__h105" data-evt3="contextmenu" data-act-args3="${JSON.stringify([it.id]).replace(/"/g, "&quot;")}"
        data-act4="__h106" data-evt4="dragstart" data-act-args4="${JSON.stringify([it.id]).replace(/"/g, "&quot;")}" data-act5="__h107" data-evt5="dragend" data-act-args5="[]" data-act6="__h108" data-evt6="dragover" data-act-args6="[]" data-act7="__h109" data-evt7="drop" data-act-args7="${JSON.stringify([it.id]).replace(/"/g, "&quot;")}">
        <div class="card-thumb">${thHtml}${reelOverlay}</div>
        <div class="card-body">
          <div class="card-title" title="${escapeHtml(it.title)}">${displayTitle}</div>
          <div class="card-tags">${(it.tags||[]).slice(0,4).map(t => tagHtml(t, q)).join('')}</div>
        </div>
      </div>`;
    }).join('');
  }
  setupLibGridLazyLoad(); // 🆕 v1.5：卡片封面图懒加载，滚动到视野附近才去读
  bindLibGridScroll(); // 🆕 v1.5-fix2：无限滚动的滚动监听（只绑定一次）
  scheduleLibGridLoadMore(); // 🆕 v1.5-fix2：内容不足一屏时也自动补下一页，避免滚不动
  renderDetailPanel();
  updateLibBatchBar(); // 🆕 v1.4：每次重渲染都同步一下批量操作条的状态（数量/显隐）
  bindLibGridMarquee(); // 🆕 2026-11-26：空白处框选，只绑定一次
}

// 🆕 v1.5：主页卡片封面图懒加载引擎。每次重渲染网格都会把 DOM 节点全部换掉，所以每次都要重新绑定观察器。
let libGridObserver = null;
const LIB_PAGE_SIZE = 60; // 🆕 v1.5-fix2：无限滚动每页张数
let libVisibleLimit = LIB_PAGE_SIZE;
let libFilterSignature = null;
let libFilteredCount = 0;
let libScrollBound = false;
let libLoadMoreScheduled = false;
let libScrollRaf = 0;
// 🆕 v1.5-fix2：滚动到底部附近自动追加一页；滚到底部后重渲染会换掉全部 DOM，
// 因此先记下滚动位置、渲染完再恢复，避免滚回顶部。
function onLibGridScroll() {
  if (libScrollRaf) return;
  libScrollRaf = requestAnimationFrame(() => {
    libScrollRaf = 0;
    const rootEl = document.getElementById('grid-wrapper');
    if (!rootEl || libVisibleLimit >= libFilteredCount) return;
    if (rootEl.scrollTop + rootEl.clientHeight < rootEl.scrollHeight - 600) return;
    const st = rootEl.scrollTop;
    libVisibleLimit += LIB_PAGE_SIZE;
    renderLibraryGrid();
    rootEl.scrollTop = st;
  });
}
function bindLibGridScroll() {
  if (libScrollBound) return;
  const rootEl = document.getElementById('grid-wrapper');
  if (!rootEl) return;
  rootEl.addEventListener('scroll', onLibGridScroll, { passive: true });
  libScrollBound = true;
}
function scheduleLibGridLoadMore() {
  if (libLoadMoreScheduled) return;
  libLoadMoreScheduled = true;
  requestAnimationFrame(() => {
    libLoadMoreScheduled = false;
    const rootEl = document.getElementById('grid-wrapper');
    if (!rootEl || libVisibleLimit >= libFilteredCount) return;
    if (rootEl.scrollHeight - rootEl.scrollTop - rootEl.clientHeight < 600) {
      libVisibleLimit += LIB_PAGE_SIZE;
      renderLibraryGrid();
    }
  });
}
function setupLibGridLazyLoad() {
  if (libGridObserver) { libGridObserver.disconnect(); }
  const rootEl = document.getElementById('grid-wrapper');
  libGridObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      libGridObserver.unobserve(entry.target);
      loadCardCoverInto(entry.target);
    });
  }, { root: rootEl, rootMargin: '800px 0px', threshold: 0.01 });

  document.querySelectorAll('#grid .card').forEach(el => {
    const item = DB.items.find(i => i.id === el.getAttribute('data-id'));
    if (!item) return;
    const shot = getItemCoverShot(item);
    if (!shot || window.blobCache[shot.id]) return; // 没有封面图，或者已经加载过了，不用再观察
    libGridObserver.observe(el);
  });
}
async function loadCardCoverInto(cardEl) {
  const item = DB.items.find(i => i.id === cardEl.getAttribute('data-id'));
  if (!item) return;
  const shot = getItemCoverShot(item);
  if (!shot) return;
  await ensureDisplayBlob(item, shot, 'card');
  const thumbEl = cardEl.querySelector('.card-thumb');
  if (thumbEl && window.blobCache[shot.id]) thumbEl.innerHTML = getShotImgHtml(shot);
}

// 🆕 v1.4：搜索关键字高亮。沿用现有代码里"标题/标签不做 HTML 转义直接拼接"的一贯做法，这里同样只做正则替换，不引入新的转义行为。
function highlightMatch(text, q) {
  // 🆕 v1.5-fix：先转义原文与查询词，再在转义后的文本上加 <mark>，避免标题里的
  // HTML 被原样拼进页面（见 A-03）。查询词同样转义后参与匹配（如 & -> &amp;）。
  const safe = escapeHtml(text || '');
  if (!q) return safe;
  try {
    const safeQ = escapeHtml(q);
    const re = new RegExp('(' + safeQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return safe.replace(re, '<mark class="hl-mark">$1</mark>');
  } catch (e) { return safe; }
}

/* ═══════════════════════════════════════════════════════
   修复建议4：轻量撤销机制 (Ctrl+Z)
   仅覆盖"纯元数据"编辑（标题/分类/标签/链接/备注），不覆盖涉及物理文件增删移动的操作
   （上传图片、删除入回收站、彻底删除、整理文件名等），避免撤销后数据库记录与硬盘文件不一致
═══════════════════════════════════════════════════════ */
let undoStack = [];
function pushUndoSnapshot(itemId, label) {
  const it = DB.items.find(x => x.id === itemId); if (!it) return;
  undoStack.push({
    itemId, label,
    prevTitle: it.title, prevCategoryId: it.categoryId,
    prevTags: [...(it.tags || [])], prevLinks: JSON.parse(JSON.stringify(it.links || [])),
  });
  if (undoStack.length > 30) undoStack.shift();
}
async function performUndo() {
  if (!undoStack.length) { showToast('没有可撤销的编辑操作了', 'warning'); return; }
  const u = undoStack.pop();
  const it = DB.items.find(x => x.id === u.itemId);
  if (!it) { showToast('无法撤销：对应素材已不存在（可能已被删除）', 'error'); return; }

  // 如果标题或分类发生过变化，物理文件夹也要同步撤销改名，避免图片路径和数据库记录脱节
  if (dirHandle && (it.title !== u.prevTitle || it.categoryId !== u.prevCategoryId)) {
    const curPath = getItemFolderPath(it);
    const restoredPath = getItemFolderPath({ ...it, title: u.prevTitle, categoryId: u.prevCategoryId });
    if (curPath !== restoredPath) await moveFs(dirHandle, curPath, restoredPath, false).catch(() => {});
  }

  it.title = u.prevTitle; it.categoryId = u.prevCategoryId; it.tags = u.prevTags; it.links = u.prevLinks;
  renderLibrary(); renderSidebarStats(); renderDetailPanel(); scheduleSave();
  showToast(`↩️ 已撤销：${u.label}`);
}

function selectItem(id) {
  selectedId = id;
  DB.recent = DB.recent.filter(x => x !== id); DB.recent.unshift(id);
  if (DB.recent.length > 8) DB.recent.pop(); scheduleSave();
  updateGridSelectionClasses();
  renderDetailPanel();
}

// 只更新卡片的选中态样式，不重建整个网格的DOM节点。
// 原因：如果每次单击都用 grid.innerHTML = ... 整体重新生成卡片，
// 浏览器判定"双击"的依据——两次点击是否命中同一个DOM元素——就会失效
// （第二次点击命中的其实是第一次点击后新造出来的节点），导致 dblclick 永远不触发。
function updateGridSelectionClasses() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  grid.querySelectorAll('.card[data-id]').forEach(el => {
    const id = el.getAttribute('data-id');
    el.classList.toggle('selected', selectedId === id);
    el.classList.toggle('multi-selected', libSelectedIds.has(id));
  });
}

/* ═══════════════════════════════════════════════════════
   修复4：主界面卡片多选 + 拖拽整体重排（类似手机相册批量拖动排序）
═══════════════════════════════════════════════════════ */
let libSelectedIds = new Set();
let libLastClickedId = null;
let libDisplayedIds = [];
let libDragIds = [];

function handleCardClick(id, event) {
  if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd+点击：多选切换，不影响右侧详情面板当前锁定的档案
    if (libSelectedIds.has(id)) libSelectedIds.delete(id); else libSelectedIds.add(id);
    libLastClickedId = id;
    updateGridSelectionClasses();
    updateLibBatchBar();
    return;
  }
  if (event.shiftKey && libLastClickedId && libDisplayedIds.length) {
    const a = libDisplayedIds.indexOf(libLastClickedId), b = libDisplayedIds.indexOf(id);
    if (a !== -1 && b !== -1) {
      const [min, max] = a < b ? [a, b] : [b, a];
      for (let i = min; i <= max; i++) libSelectedIds.add(libDisplayedIds[i]);
      updateGridSelectionClasses();
      updateLibBatchBar();
      return;
    }
  }
  // 普通单击：只打开右侧详情，不进多选、不弹批量条；
  // 多选只由 Ctrl/Cmd+点击、Shift 区间或空白处框选产生（2026-11-26 改：原来单击就累加进多选，太敏感）
  selectItem(id);
}

// 🆕 2026-11-26：主界面 Ctrl+A 全选当前列表（当前分类／搜索筛出来的卡片）；锚点落在最后一张，之后 Shift+点击可从末尾往回圈
function selectAllLibItems() {
  if (!libDisplayedIds.length) return;
  libSelectedIds = new Set(libDisplayedIds);
  libLastClickedId = libDisplayedIds[libDisplayedIds.length - 1];
  updateGridSelectionClasses();
  updateLibBatchBar();
}

// 🆕 2026-11-26：空白处框选（橡皮筋多选）。在网格空白处按下鼠标拖出一个框，
// 框住的卡片全部进多选、批量条才出现；空白处单击一下则取消已有的多选。
let libMarqueeBound = false;
function bindLibGridMarquee() {
  const wrap = document.getElementById('grid-wrapper');
  if (!wrap || libMarqueeBound) return;
  libMarqueeBound = true;
  wrap.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest('.card') || e.target.closest('#lib-batch-bar') || e.target.closest('button') || e.target.closest('.empty-state')) return;
    if (!document.querySelector('#grid .card')) return;
    e.preventDefault(); // 防止拖动时选中页面文字
    const startX = e.clientX, startY = e.clientY;
    let rectEl = null, moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      if (!moved) {
        moved = true;
        rectEl = document.createElement('div');
        rectEl.id = 'lib-marquee';
        document.body.appendChild(rectEl);
      }
      const x = Math.min(startX, ev.clientX), y = Math.min(startY, ev.clientY);
      const w = Math.abs(dx), h = Math.abs(dy);
      rectEl.style.left = x + 'px'; rectEl.style.top = y + 'px';
      rectEl.style.width = w + 'px'; rectEl.style.height = h + 'px';
      const r = { left: x, top: y, right: x + w, bottom: y + h };
      const hit = new Set();
      document.querySelectorAll('#grid .card[data-id]').forEach(el => {
        const b = el.getBoundingClientRect();
        if (b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) hit.add(el.getAttribute('data-id'));
      });
      libSelectedIds = hit;
      updateGridSelectionClasses();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (rectEl) rectEl.remove();
      if (!moved) {
        // 空白处单击：取消已有的多选
        if (libSelectedIds.size) { libSelectedIds.clear(); updateGridSelectionClasses(); updateLibBatchBar(); }
      } else {
        updateLibBatchBar();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function libCardDragStart(id, e) {
  if (!libSelectedIds.has(id)) { libSelectedIds.clear(); libSelectedIds.add(id); renderLibraryGrid(); }
  libDragIds = Array.from(libSelectedIds);
  e.dataTransfer.effectAllowed = 'move';
  if (e.target && e.target.classList) e.target.classList.add('lib-dragging');
}
function libCardDragEnd(e) { if (e.target && e.target.classList) e.target.classList.remove('lib-dragging'); libDragIds = []; }
function libCardDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function libCardDrop(targetId, e) {
  e.preventDefault();
  if (!libDragIds.length || libDragIds.includes(targetId)) { libDragIds = []; return; }

  // 手动拖拽排序只在"默认排序"下才有意义，若当前是别的排序方式，自动切换过去
  if ((DB.settings.sortMode || 'default') !== 'default') {
    DB.settings.sortMode = 'default';
    const lbl = document.getElementById('sort-btn-label'); if (lbl) lbl.textContent = SORT_LABELS['default'];
    showToast('ℹ️ 已自动切换为"默认排序"以便手动拖拽排序');
  }

  const draggedSet = new Set(libDragIds);
  const draggedItems = DB.items.filter(it => draggedSet.has(it.id)); // 保持被拖拽项相互间的相对顺序
  const remaining = DB.items.filter(it => !draggedSet.has(it.id));
  const targetIdx = remaining.findIndex(it => it.id === targetId);
  if (targetIdx === -1) { libDragIds = []; return; }
  remaining.splice(targetIdx, 0, ...draggedItems);
  DB.items = remaining;

  libDragIds = []; libSelectedIds.clear();
  renderLibraryGrid(); scheduleSave();
  showToast('✅ 已调整素材顺序');
}

// 🆕 v1.4：主页卡片批量操作条（多选本身早就支持 Ctrl/Cmd 与 Shift，只是一直缺一个看得见的批量入口）
function updateLibBatchBar() {
  const bar = document.getElementById('lib-batch-bar');
  const countEl = document.getElementById('lib-batch-count');
  if (!bar) return;
  const n = libSelectedIds.size;
  if (n > 0) { bar.classList.add('show'); if (countEl) countEl.textContent = `已选 ${n} 项`; }
  else { bar.classList.remove('show'); }
}
function clearLibBatchSelection() { libSelectedIds.clear(); renderLibraryGrid(); }

// 🆕 2026-11-26：批量删除确认弹窗。主界面批量删除只是把选中项移入回收站（不是彻底删除），
// 所以不用像回收站彻底删除那样输入「删除」两字确认，点一下确定删除就行。
function openBatchDeleteModal() {
  const n = libSelectedIds.size;
  if (!n) return;
  const textEl = document.getElementById('batch-delete-text');
  if (textEl) textEl.textContent = `即将删除 ${n} 项内容，移至回收站。`;
  const modal = document.getElementById('batch-delete-modal');
  if (modal) modal.classList.add('show');
}
function cancelBatchDeleteModal() {
  const modal = document.getElementById('batch-delete-modal');
  if (modal) modal.classList.remove('show');
}
async function confirmBatchDeleteModal() {
  const modal = document.getElementById('batch-delete-modal');
  if (modal) modal.classList.remove('show');
  const ids = Array.from(libSelectedIds); if (!ids.length) return;
  for (const id of ids) {
    const item = DB.items.find(i => i.id === id); if (!item) continue;
    const trashObj = { id: uid(), type: 'item', data: item, deletedAt: Date.now() };
    if (dirHandle) await moveFs(dirHandle, getItemFolderPath(item), `已删除（回收站）/${sanitizeName(item.title)}_${item.id}`, false);
    DB.trash.push(trashObj);
  }
  const idSet = new Set(ids);
  DB.items = DB.items.filter(i => !idSet.has(i.id));
  if (idSet.has(selectedId)) selectedId = null;
  libSelectedIds.clear();
  renderLibrary(); scheduleSave();
  showToast(`✅ 已将 ${ids.length} 项档案移入回收站`);
}

// 🆕 2026-11-26：批量合并——把选中的多项合并为一项，名字由用户输入，原图都会保留。
// 合并底是选中的多项里图片最多的那一项（不是第一项），它的文件夹改成新名字，
// 其余项的图片搬进来。图片数按实际图片张数算（视频只有链接没有文件，不算）。
function _mergeBaseItem(ids) {
  let base = null, best = -1;
  for (const id of ids) {
    const it = DB.items.find(i => i.id === id);
    if (!it) continue;
    const n = (it.shots || []).filter(s => s.type !== 'reel').length;
    if (n > best) { best = n; base = it; }
  }
  return base;
}
function openMergeModal() {
  const ids = Array.from(libSelectedIds);
  if (ids.length < 2) { showToast('请至少选择两项再合并', 'warning'); return; }
  const base = _mergeBaseItem(ids);
  const input = document.getElementById('f-merge-name');
  if (input) input.value = base ? base.title : '';
  const confirmInput = document.getElementById('f-merge-confirm');
  if (confirmInput) confirmInput.value = '';
  const tip = document.getElementById('merge-tip');
  if (tip) tip.textContent = `将选中的 ${ids.length} 项合并为一项，请输入合并后的文件夹名称，原图都会保留。`;
  const modal = document.getElementById('merge-modal');
  if (modal) modal.classList.add('show');
  if (input) { input.focus(); input.select(); }
}
function closeMergeModal() { const m = document.getElementById('merge-modal'); if (m) m.classList.remove('show'); }
async function confirmMergeSelected() {
  const input = document.getElementById('f-merge-name');
  const name = input ? input.value.trim() : '';
  if (!name) { showToast('请输入合并后的名称', 'warning'); return; }
  const ids = Array.from(libSelectedIds);
  if (ids.length < 2) { closeMergeModal(); return; }
  const base = _mergeBaseItem(ids);
  if (!base) { closeMergeModal(); return; }
  if (!base.shots) base.shots = [];
  if (!base.tags) base.tags = [];
  if (!base.links) base.links = [];
  if (isDuplicateItemTitle(name, base.categoryId, base.id)) { showToast(`该分类下已存在同名素材「${name}」，请换一个名称`, 'error'); return; }
  // 合并是不可逆操作（来源文件夹会被删掉），点确定之前必须先输入「合并」两字确认，没输对就什么都不动
  const confirmInput = document.getElementById('f-merge-confirm');
  const typed = confirmInput ? confirmInput.value.trim() : '';
  if (typed !== '合并') { showToast('输入内容不匹配，请重新输入「合并」两个字', 'warning'); return; }
  closeMergeModal();
  // 先改名搬文件夹（改名失败就什么都不动，直接退出）
  const oldTitle = base.title;
  const oldPath = getItemFolderPath(base);
  base.title = name;
  const newPath = getItemFolderPath(base);
  if (dirHandle && oldPath !== newPath) {
    const ok = await renameItemFolderWithFiles(base, oldPath, newPath);
    if (!ok) { base.title = oldTitle; showToast('合并失败：文件夹改名未成功，什么都没改', 'error'); return; }
  }
  let failedShots = 0;
  // 🆕 2026-11-26：合并后只留一个封面——先点的那项的封面。原来搬图时把来源项的 pinned 也一起搬过来了，
  // 合并完一项里就有两个 pinned，九宫格里两个图都带封面样式。先点的那项的封面按“有 pinned 的非视频、没有就第一张非视频”算。
  const _firstItem = DB.items.find(i => i.id === ids[0]);
  const _firstCover = (_firstItem && (_firstItem.shots || []).find(s => s.pinned && s.type !== 'reel')) || (_firstItem && (_firstItem.shots || []).find(s => s.type !== 'reel'));
  const _firstCoverId = _firstCover ? _firstCover.id : null;
  // 序号从底那项的图片张数往后接（只数图片，视频不占序号），保证合并后文件名连续不跳号；
  // 文件名里的日期取每张图当初存进来那天（shot.addedAt），改名只换名字部分，日期不动
  let seq = (base.shots || []).filter(s => s.type !== 'reel').length;
  const removedIds = [];
  for (const id of ids) {
    if (id === base.id) continue;
    const src = DB.items.find(i => i.id === id);
    if (!src) continue;
    const srcPath = getItemFolderPath(src);
    for (const shot of (src.shots || [])) {
      if (shot.type === 'reel') { base.shots.push(shot); continue; } // 视频只有链接没有本地文件，直接并记录
      seq++;
      const newFName = buildShotFileName(base, shot, seq);
      let moved = false;
      if (dirHandle) {
        moved = await moveFs(dirHandle, srcPath + '/' + shotFileName(shot), getItemFolderPath(base) + '/' + newFName, true);
      } else { moved = true; } // 没连文件夹时只有数据库记录，直接合并不搬文件
      if (moved) { shot.fileName = newFName; base.shots.push(shot); }
      else failedShots++;
    }
    base.tags = [...new Set([...(base.tags || []), ...(src.tags || [])])];
    const seenLinks = new Set((base.links || []).map(l => JSON.stringify(l)));
    (src.links || []).forEach(l => { const key = JSON.stringify(l); if (!seenLinks.has(key)) { seenLinks.add(key); base.links.push(l); } });
    // 删掉来源文件夹（里面只剩缩略图缓存），并从库里移除
    if (dirHandle) {
      const parts = srcPath.split('/'); const folderName = parts.pop();
      const parent = await getDirHandleByPath(dirHandle, parts.join('/'), false);
      if (parent) await parent.removeEntry(folderName, { recursive: true }).catch(() => {});
    }
    removedIds.push(src.id);
  }
  // 🆕 2026-11-26：合并后只留一个封面（先点的那项的封面；它那张图没搬过来就退回底里的第一张非视频图）
  (base.shots || []).forEach(s => { s.pinned = false; });
  const _cover = (base.shots || []).find(s => s.id === _firstCoverId) || (base.shots || []).find(s => s.type !== 'reel');
  if (_cover) _cover.pinned = true;
  const removedSet = new Set(removedIds);
  DB.items = DB.items.filter(i => !removedSet.has(i.id));
  if (removedSet.has(selectedId)) selectedId = base.id;
  libSelectedIds.clear();
  renderLibrary(); scheduleSave();
  showToast(`✅ 已将 ${removedIds.length + 1} 项合并为「${name}」${failedShots ? `，${failedShots} 张原图未能搬迁` : ''}`);
}

function renderDetailPanel() {
  const items = DB.items;
  const item = items.find(x => x.id === selectedId);
  const p = document.getElementById('detail-placeholder'), c = document.getElementById('detail-content');
  if (!item) { if(p) p.style.display = 'flex'; if(c) c.style.display = 'none'; return; }
  if(p) p.style.display = 'none'; if(c) c.style.display = 'flex';
  
  const pinned = (item.shots||[]).find(s=>s.pinned) || (item.shots||[])[0];
  const cvI = document.getElementById('cover-img'), cvIc = document.getElementById('cover-icon');
  
  if (pinned) {
    if (pinned.type === 'reel') {
      const ytm = pinned.url && pinned.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^"&?\/\s]{11})/);
      if (ytm && cvI) { cvI.src = `https://i.ytimg.com/vi/${ytm[1]}/hqdefault.jpg`; cvI.style.display = 'block'; if(cvIc) cvIc.style.display = 'none'; }
      else if(cvI) { cvI.style.display = 'none'; if(cvIc){ cvIc.style.display = 'block'; cvIc.className = 'ti ti-player-play-filled'; cvIc.style.color = 'var(--tx)';} }
    } else {
      if(cvI) {
        const cached = window.blobCache[pinned.id] || pinned.dataUrl;
        cvI.src = cached || ''; cvI.style.display = 'block';
        if (!cached) {
          // 🆕 v1.5：详情面板封面图按需加载（可能还没被主页卡片的懒加载触发过）
          ensureDisplayBlob(item, pinned, 'card').then(url => {
            if (url && selectedId === item.id && document.getElementById('cover-img')) document.getElementById('cover-img').src = url;
          });
        }
      }
      if(cvIc) cvIc.style.display = 'none';
    }
  } else { 
    if(cvI) cvI.style.display = 'none'; 
    if(cvIc) { cvIc.style.display = 'block'; cvIc.className = 'ti ti-photo'; cvIc.style.color = 'var(--txm)'; }
  }

  if(document.getElementById('detail-title')) document.getElementById('detail-title').textContent = item.title;
  if(document.getElementById('detail-tags')) document.getElementById('detail-tags').innerHTML = (item.tags||[]).map(tagHtml).join('');
  
  const lList = document.getElementById('links-list');
  if(lList) {
    lList.innerHTML = (item.links||[]).map((l, i) => {
      const plat = detectPlatform(l.url), isVid = isVideoLink(l.url), pName = l.name && l.name !== l.url ? l.name : plat.key;
      // v1.5-fix3：FB 头像已移除（Whitaker 决定 A）。FB 链接一律显示通用平台图标，不再调 Graph API。
      const avatarHtml = `<i class="${isVid ? 'ti ti-player-play-filled' : plat.icon}"></i>`;
      return `<div class="link-row">
        <div class="link-avatar" style="background:${plat.bg};color:${plat.color}">${avatarHtml}</div>
        <div class="link-info"><div class="link-name" title="${escapeHtml(pName)}">${escapeHtml(pName)}</div><div class="link-url" title="${escapeHtml(l.url)}">${escapeHtml(l.url)}</div></div>
        <i class="ti ti-copy link-action" title="复制此链接" data-act="__h111" data-evt="click" data-act-args="${JSON.stringify([i]).replace(/"/g, "&quot;")}"></i>
        <i class="ti ti-external-link link-action" title="跨时空跳出至外网" data-act="__h112" data-evt="click" data-act-args="${JSON.stringify([l.url.startsWith('http') ? l.url : 'https://' + l.url]).replace(/"/g, "&quot;")}"></i>
        <i class="ti ti-x link-action danger" title="抹除此链接" data-act="__h113" data-evt="click" data-act-args="${JSON.stringify([i]).replace(/"/g, "&quot;")}"></i>
      </div>`;
    }).join('');
  }
  
  const sGrid = document.getElementById('shots-grid');
  if(sGrid) {
    sGrid.innerHTML = (item.shots||[]).slice(0, 9).map((s, i) => {
      const isP = s.pinned || (i === 0 && !item.shots.some(x=>x.pinned));
      const shotOnClickAttr = s.type === 'reel'
        ? ` data-act="__h114" data-evt="click" data-act-args="${JSON.stringify([s.url.startsWith('http') ? s.url : 'https://' + s.url]).replace(/"/g, "&quot;")}"`
        : ` data-act="__h115" data-evt="click" data-act-args="${JSON.stringify([item.id, i]).replace(/"/g, "&quot;")}"`;
      return `<div class="shot-thumb${isP?' pinned':''}"${shotOnClickAttr}>
        ${getShotImgHtml(s, '')}
        <div class="shot-overlay"><button class="shot-btn-sm pin" data-act="__h116" data-evt="click" data-act-args="${JSON.stringify([i]).replace(/"/g, "&quot;")}">${isP?'主核封面':'设为门面'}</button><button class="shot-btn-sm" style="background:var(--dr)" data-act="__h117" data-evt="click" data-act-args="${JSON.stringify([i]).replace(/"/g, "&quot;")}"><i class="ti ti-trash"></i></button></div>
      </div>`;
    }).join('');
  }
  
  const sLen = (item.shots||[]).length;
  if(document.getElementById('shots-more')) {
      document.getElementById('shots-more').innerHTML = sLen > 9 ? `<div class="det-label-btn" style="display:inline-flex; padding:6px 12px; margin-top:8px; width:100%; justify-content:center;">+ 还有 ${sLen-9} 张，点击查看全部画廊</div>` : '';
  }
  
  if(document.getElementById('add-link-row')) document.getElementById('add-link-row').style.display = 'flex';
  if(document.getElementById('shot-upload-btn')) document.getElementById('shot-upload-btn').style.display = 'flex';
  if(document.getElementById('detail-footer')) document.getElementById('detail-footer').style.display = 'flex';
}

function addLinkFromInput() {
  const v = document.getElementById('link-input').value.trim(); if(!v) return;
  const errBox = document.getElementById('tiktok-error');
  if(isBlockedPlatform(v)) { document.getElementById('link-input').classList.add('error'); errBox.textContent = '⛔ 已拦截限制级国内平台网址'; errBox.style.display='block'; return; }
  const it = DB.items.find(x=>x.id===selectedId); if(!it) return;
  it.links=it.links||[];
  // 重复检测：同一素材下不允许添加重复链接
  if (it.links.some(l => l.url === v)) {
    document.getElementById('link-input').classList.add('error');
    errBox.textContent = '⚠️ 该链接已存在，不允许重复添加';
    errBox.style.display='block';
    return;
  }
  it.links.push({url:v, name:extractNameFromUrl(v)});
  document.getElementById('link-input').value=''; document.getElementById('link-input').classList.remove('error'); errBox.style.display='none'; renderDetailPanel(); scheduleSave();
}
function removeLink(i) { const it=DB.items.find(x=>x.id===selectedId); if(it) { pushUndoSnapshot(it.id, '删除链接'); it.links.splice(i,1); renderDetailPanel(); scheduleSave(); } }

function copyAllLinks() {
  const item = (DB.items).find(x=>x.id===selectedId);
  if(!item || !item.links || item.links.length === 0) return showToast('此项目节点暂无任何外部链接信标', 'warning');
  navigator.clipboard.writeText(item.links.map(l=>l.url).join('\n')).then(() => showToast('✅ 节点内所有关联外链已一键复制')).catch(()=>showToast('浏览器限制了本次复制操作','error'));
}

// 安全审计 2026-11-26（S-05）：只许打开 http(s) 外链。直接 window.open(用户存的链接) 会放行 javascript: 等危险协议，
// 且不加 noopener 会让对方页面拿到 window.opener。非法协议直接拦下不打开。
function openExternalLink(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) { showToast('⚠️ 仅支持打开 http(s) 链接', 'warning'); return; }
  window.open(url, '_blank', 'noopener');
}

function copySingleLink(idx) {
  const item = (DB.items).find(x=>x.id===selectedId);
  const link = item && (item.links||[])[idx]; if(!link) return;
  navigator.clipboard.writeText(link.url).then(() => showToast('✅ 链接已复制')).catch(()=>showToast('浏览器限制了本次复制操作','error'));
}

async function uploadShots() { if (!dirHandle) { showToast('尚未连接本地文件夹，无法自动保存，请先在左侧连接文件夹', 'error'); return; } document.getElementById('shot-file-input').click(); }

async function handleShotUpload(e) {
  const files = Array.from(e.target.files); const item = DB.items.find(i => i.id === selectedId); if (!item || !files.length) return;
  item.shots = item.shots || []; let count = 0;
  
  if (dirHandle) {
    const itemDir = await getDirHandleByPath(dirHandle, getItemFolderPath(item), true);
    let seq = item.shots.filter(s => s.type !== 'reel').length + 1;
    for (const f of files) {
      const sId = uid(); const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
      const shot = { id: sId, ext, pinned: false, addedAt: Date.now() };
      let fName = buildShotFileName(item, shot, seq);
      try {
        const fh = await itemDir.getFileHandle(fName, { create: true });
        const w = await fh.createWritable(); await w.write(f); await w.close();
        shot.fileName = fName;
        item.shots.push(shot);
        setShotBlob(sId, f); count++; seq++;
      } catch(err) {}
    }
    if (count > 0 && !item.shots.some(s => s.pinned)) item.shots[0].pinned = true;
    e.target.value = ''; renderDetailPanel(); renderLibraryGrid();
    // 实时刷新素材预览（九宫格）弹窗，无需手动重进
    if (document.getElementById('nine-grid-modal') && document.getElementById('nine-grid-modal').classList.contains('show') && currentNineGridItemId === item.id) {
      renderNineGrid(); updateNineGridToolbar();
    }
    scheduleSave(); showToast(`✅ 解压完成，共导入 ${count} 张图片`);
  }
}

// 核心修复：仅"外部文件"拖入（本地文件管理器 / 剪贴板文件）才触发全局入库提示与逻辑
// 🆕 v1.4：整块「外部文件拖拽入库」功能已按需求下线（拖入图片不再自动物理存档）。
// 原因：放大图片查看时用鼠标左右拖动会误触这套逻辑。如需要文件级入库，请使用「新增素材档案」弹窗里的正常选择/粘贴上传方式。

// 🆕 v1.3：设为封面时，把该图片真正移到 shots 数组最前面（而不仅仅打个 pinned 标记），
// 这样九宫格画廊、大图浏览等任何按数组顺序展示的地方，封面图都会始终排在第一张
function setPinnedShotAndReorder(item, idx) {
  if (!item || !item.shots || idx < 0 || idx >= item.shots.length) return;
  const [shot] = item.shots.splice(idx, 1);
  shot.pinned = true;
  item.shots.forEach(s => { s.pinned = false; });
  item.shots.unshift(shot);
}

function pinShot(idx) { const it=DB.items.find(x=>x.id===selectedId); if(it) { setPinnedShotAndReorder(it, idx); renderDetailPanel(); renderLibraryGrid(); scheduleSave(); } }

async function deleteCurrentItem(isCtx = false) {

  const id = isCtx ? ctxCardId : selectedId; const item = DB.items.find(i => i.id === id); if (!item) return;
  if (!confirm(`确认将该档案彻底移入物理防丢回收站内？(文件将发生物理移位)`)) return;
  
  const trashObj = { id: uid(), type: 'item', data: item, deletedAt: Date.now() };
  if (dirHandle) await moveFs(dirHandle, getItemFolderPath(item), `已删除（回收站）/${sanitizeName(item.title)}_${item.id}`, false);
  
  DB.trash.push(trashObj); DB.items = DB.items.filter(i => i.id !== item.id);
  if(selectedId === id) selectedId = null;
  renderLibrary(); scheduleSave(); showToast('记录连带原图已安全封存在系统回收站内');
}

async function deleteShot(idx) {

  const item = DB.items.find(i => i.id === selectedId); if (!item) return;
  const shot = item.shots[idx];
  const trashObj = { id: uid(), type: 'shot', data: shot, originalItemId: item.id, originalTitle: item.title, deletedAt: Date.now() };
  if (dirHandle && shot.type !== 'reel') await moveFs(dirHandle, `${getItemFolderPath(item)}/${shotFileName(shot)}`, `已删除（回收站）/${shotTrashFileName(shot)}`, true);
  
  DB.trash.push(trashObj); item.shots.splice(idx, 1);
  if (item.shots.length > 0 && !item.shots.some(s => s.pinned)) item.shots[0].pinned = true;
  renderDetailPanel(); renderLibraryGrid(); scheduleSave(); showToast('该图片已移入回收站');
}

const SORT_LABELS = {
  'default': '排序方式', 'name-asc': '名字 A-Z', 'name-desc': '名字 Z-A',
  'count-desc': '数量：多→少', 'count-asc': '数量：少→多',
  'created-desc': '日期：新→旧', 'created-asc': '日期：旧→新',
  'recent': '最近使用优先'
};
function toggleSortDropdown(e) {
  // 注意：全局有一个 document 级别的 click 监听器会在每次点击后关闭所有 .ctx-menu（用于点击外部收起菜单）。
  // 该监听器和本函数都绑定在 document 上，仅 stopPropagation() 无法阻止"同一节点上、按注册顺序排在后面"的
  // 监听器执行，导致菜单刚被打开又被立刻关闭（表现为点击排序按钮没有反应）。
  // 用 stopImmediatePropagation() 阻止本次点击事件继续触发其他监听器，才能让菜单正常保持打开。
  e.stopPropagation();
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  const dd = document.getElementById('sort-dropdown'); if (!dd) return;
  const isShown = dd.classList.contains('show');
  document.querySelectorAll('.ctx-menu').forEach(m => m.classList.remove('show'));
  if (!isShown) dd.classList.add('show');
}
function applySortMode(mode) {
  DB.settings.sortMode = mode;
  const lbl = document.getElementById('sort-btn-label'); if (lbl) lbl.textContent = SORT_LABELS[mode] || '排序方式';
  if(document.getElementById('sort-dropdown')) document.getElementById('sort-dropdown').classList.remove('show');
  scheduleSave(); renderLibraryGrid();
}
function sortItemsList(items, mode) {
  const arr = items.slice();
  switch (mode) {
    case 'name-asc': return arr.sort((a,b) => (a.title||'').localeCompare(b.title||'', 'zh'));
    case 'name-desc': return arr.sort((a,b) => (b.title||'').localeCompare(a.title||'', 'zh'));
    case 'count-desc': return arr.sort((a,b) => (b.shots||[]).length - (a.shots||[]).length);
    case 'count-asc': return arr.sort((a,b) => (a.shots||[]).length - (b.shots||[]).length);
    case 'created-desc': return arr.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    case 'created-asc': return arr.sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    case 'recent': {
      // 🆕 v1.5-fix：预建 Map 查排名，不再每次比较都 indexOf（见 A-05）。
      const rankMap = new Map((DB.recent || []).map((id, i) => [id, i]));
      return arr.sort((a,b) => {
        const ra = rankMap.has(a.id) ? rankMap.get(a.id) : Infinity;
        const rb = rankMap.has(b.id) ? rankMap.get(b.id) : Infinity;
        return ra - rb;
      });
    }
    default: return arr;
  }
}

/* ═══════════════════════════════════════════════════════
   CONTEXT MENU ENGINE (全局右键菜单定位调度系统) ← 核心修复
═══════════════════════════════════════════════════════ */
function showContextMenu(e, menuId, id) {
  e.preventDefault();
  e.stopPropagation();
  // 先隐藏所有已展开的菜单
  document.querySelectorAll('.ctx-menu').forEach(m => m.classList.remove('show'));
  // 设置目标 ID 上下文
  if (menuId === 'ctx-cat' && id) ctxCatId = id;
  if (menuId === 'ctx-card' && id) { ctxCardImgId = id; ctxCardId = id; }
  // 修复：如果当前正停留在某个具体分类目录内，主界面空白处右键不再显示"新建分类目录"，
  // 只保留"登记全新素材"（并会智能预选当前目录，见 openAddModal），避免用户重复选择目录
  if (menuId === 'ctx-grid') {
    const newCatItem = document.querySelector('#ctx-grid .ctx-item[data-act="__h91"]');
    if (newCatItem) newCatItem.style.display = (currentFilter && currentFilter.type === 'category') ? 'none' : 'flex';
  }
  // 🆕 v1.3：九宫格右键菜单——多选时把"另存到桌面"文案换成"打包导出选中项(N)"，避免用户以为批量导出只能走顶部工具栏按钮
  if (menuId === 'ctx-nine') {
    const saveLabel = document.getElementById('ctx-nine-save-label');
    const isBatch = nineGridSelectedIds.size > 1 && nineGridSelectedIds.has(nineCtxCurrentIdx);
    if (saveLabel) {
      saveLabel.innerHTML = isBatch
        ? `<i class="ti ti-package"></i> 打包导出选中项 (${nineGridSelectedIds.size})`
        : `<i class="ti ti-download"></i> 将此图另存到桌面`;
    }
    // 复制剪贴板 / 设为封面 只支持单张操作，多选时隐藏这两项，避免误导
    const copyItem = document.getElementById('ctx-nine-copy-item');
    const pinItem = document.getElementById('ctx-nine-pin-item');
    if (copyItem) copyItem.style.display = isBatch ? 'none' : 'flex';
    if (pinItem) pinItem.style.display = isBatch ? 'none' : 'flex';
  }
  const menu = document.getElementById(menuId);
  if (!menu) return;
  // 先显示再定位（需要知道菜单尺寸）
  menu.classList.add('show');
  let x = e.clientX, y = e.clientY;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  // 防止菜单超出视口边界
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) menu.style.left = (x - r.width) + 'px';
    if (r.bottom > window.innerHeight - 8) menu.style.top = (y - r.height) + 'px';
  });
}

// 分类目录右键 → 修改名称
function ctxRename() {
  if(document.getElementById('ctx-cat')) document.getElementById('ctx-cat').classList.remove('show');
  const cat = DB.categories.find(c => c.id === ctxCatId);
  if (!cat) return;
  if(document.getElementById('cat-modal-title')) document.getElementById('cat-modal-title').textContent = '修改分类名称';
  if(document.getElementById('f-cat-name')) document.getElementById('f-cat-name').value = cat.name;
  if(document.getElementById('cat-modal')) document.getElementById('cat-modal').classList.add('show');
}

// 分类目录右键 → 强制删除
async function ctxDelete() {
  if(document.getElementById('ctx-cat')) document.getElementById('ctx-cat').classList.remove('show');
  const cat = DB.categories.find(c => c.id === ctxCatId);
  if (!cat) return;
  if (!confirm(`确认强制删除分类「${cat.name}」？\n该目录下的所有素材将降级为「未分类」状态，文件不会被删除。`)) return;
  const affectedCount = DB.items.filter(it => it.categoryId === ctxCatId).length;
  DB.items.forEach(it => { if (it.categoryId === ctxCatId) it.categoryId = ''; });
  DB.categories = DB.categories.filter(c => c.id !== ctxCatId);
  if (currentFilter.type === 'category' && currentFilter.value === ctxCatId) currentFilter = { type: 'all' };
  ctxCatId = null;
  scheduleSave(); renderLibrary(); showToast('✅ 分类目录已强制清除');
}

// 卡片右键 → 编辑属性
function cardCtxEdit() {
  if(document.getElementById('ctx-card')) document.getElementById('ctx-card').classList.remove('show');
  openEditModal(true);
}

/* ═══════════════════════════════════════════════════════
   IMPORT ENGINE (数据导入与图片粘贴系统)
═══════════════════════════════════════════════════════ */
function openImport() {
  if(document.getElementById('import-modal')) document.getElementById('import-modal').classList.add('show');
}

function triggerImportJSON() {
  const inp = document.getElementById('import-json-input');
  if(inp) inp.click();
}

function triggerImportWSJSON() {
  const inp = document.getElementById('import-ws-json-input');
  if(inp) inp.click();
}

async function handleImportJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const text = await file.text();
    const data = safeJsonParse(text);
    const itemCount = (data.items || []).length;
    const catCount = (data.categories || []).length;
    if (!confirm(`确认导入此 JSON 备份？\n检测到 ${itemCount} 条素材 / ${catCount} 个分类\n\n⚡ 已存在相同 ID 的记录将被自动跳过，安全合并。`)) {
      e.target.value = ''; return;
    }
    let newItems = 0, newCats = 0;
    if (Array.isArray(data.categories)) {
      data.categories.forEach(c => { if (!DB.categories.find(x => x.id === c.id)) { DB.categories.push(c); newCats++; } });
    }
    if (Array.isArray(data.items)) {
      data.items.forEach(it => { if (!DB.items.find(x => x.id === it.id)) { DB.items.unshift(it); newItems++; } });
    }
    e.target.value = '';
    if(document.getElementById('import-modal')) document.getElementById('import-modal').classList.remove('show');
    scheduleSave(); renderLibrary();
    showToast(`✅ 成功导入 ${newItems} 条素材、${newCats} 个分类`);
  } catch(err) {
    e.target.value = '';
    showToast('❌ JSON 文件解析失败：格式不匹配或文件已损坏', 'error');
  }
}

async function handleImportWSJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const text = await file.text();
    const data = safeJsonParse(text);
    if (!data.workspace) { e.target.value = ''; showToast('❌ 文件格式不正确，非工作台备份文件', 'error'); return; }
    if (!confirm('确认导入工作台备份？当前工作台数据将被此备份覆盖。')) { e.target.value = ''; return; }
    WS = Object.assign(WS, data.workspace);
    e.target.value = '';
    if(document.getElementById('import-modal')) document.getElementById('import-modal').classList.remove('show');
    scheduleSave();
    showToast('✅ 工作台数据已成功恢复');
  } catch(err) {
    e.target.value = '';
    showToast('❌ 工作台备份文件解析失败', 'error');
  }
}

// 全局监听 Ctrl+V 粘贴图片（选中素材后在主库界面直接生效）
document.addEventListener('paste', async (e) => {
  if (currentView !== 'lib' || !selectedId) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  const clipItems = e.clipboardData ? Array.from(e.clipboardData.items) : [];
  const imgItems = clipItems.filter(i => i.type.startsWith('image/'));

  // 修复3：剪贴板粘贴的是纯文本链接时，直接写入"外部网址关联视频链接"栏位
  if (!imgItems.length) {
    const textItem = clipItems.find(i => i.type === 'text/plain');
    if (!textItem) return;
    textItem.getAsString(async (text) => {
      const v = (text || '').trim();
      if (!v || !/^https?:\/\//i.test(v)) return; // 不是链接格式则不处理，避免误吞普通文本粘贴
      const item = DB.items.find(i => i.id === selectedId); if (!item) return;
      if (isBlockedPlatform(v)) { showToast('❌ 该平台链接不支持关联', 'error'); return; }
      item.links = item.links || [];
      if (item.links.some(l => l.url === v)) { showToast('该链接已存在，未重复添加', 'warning'); return; }
      item.links.push({ url: v, name: extractNameFromUrl(v) });
      renderDetailPanel(); scheduleSave();
      showToast(`🔗 已将剪贴板链接关联到「${item.title}」`);
    });
    return;
  }
  e.preventDefault();

  // 核心要求：未连接本地文件夹，一律不允许保存/入库任何素材图片
  if (!dirHandle) { showToast('🚨 必须先连接本地文件夹，才能粘贴图片入库！', 'error'); return; }

  const item = DB.items.find(i => i.id === selectedId); if (!item) return;
  item.shots = item.shots || [];
  let count = 0;
  let seq = item.shots.filter(s => s.type !== 'reel').length + 1;

  for (const ci of imgItems) {
    const file = ci.getAsFile(); if (!file) continue;
    const sId = uid();
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const shot = { id: sId, ext, pinned: false, addedAt: Date.now() };

    // 强制写入物理文件（不再降级为 dataUrl 存入 JSON）
    try {
      const itemDir = await getDirHandleByPath(dirHandle, getItemFolderPath(item), true);
      const fName = buildShotFileName(item, shot, seq);
      const fh = await itemDir.getFileHandle(fName, { create: true });
      const w = await fh.createWritable(); await w.write(file); await w.close();
      shot.fileName = fName;
      item.shots.push(shot);
      setShotBlob(sId, file);
      count++; seq++;
    } catch(err) {}
  }

  if (count > 0) {
    if (!item.shots.some(s => s.pinned)) item.shots[0].pinned = true;
    renderDetailPanel(); renderLibraryGrid();
    // 实时刷新素材预览（九宫格）弹窗，无需手动重进
    if (document.getElementById('nine-grid-modal') && document.getElementById('nine-grid-modal').classList.contains('show') && currentNineGridItemId === item.id) {
      renderNineGrid(); updateNineGridToolbar();
    }
    scheduleSave();
    showToast(`📋 已粘贴 ${count} 张图片到「${item.title}」`);
  }
});

// 主库卡片缩略图右键四项操作处理器
async function handleCardImgCtx(action) {
  if(document.getElementById('ctx-card-img')) document.getElementById('ctx-card-img').classList.remove('show');
  if (!ctxCardImgId) return;
  const item = DB.items.find(x => x.id === ctxCardImgId);
  if (!item) return;
  
  // 取封面图（首选 pinned，否则第一张非 reel）
  const shot = (item.shots || []).find(s => s.pinned && s.type !== 'reel')
            || (item.shots || []).find(s => s.type !== 'reel');
  
  if (action === 'save') {
    if (!shot) return showToast('该素材暂无图片可保存', 'warning');
    const url = await ensureOriginalBlob(item, shot) || window.blobCache[shot.id] || shot.dataUrl; // 🆕 v1.5：保存要原图
    if (!url) return showToast('图片资源未能读取，请确保已连接硬盘', 'warning');
    const a = document.createElement('a');
    a.href = url; a.download = `${sanitizeName(item.title)}.${shot.ext || 'jpg'}`; a.click();
    showToast('✅ 封面图已下载');
  }
  
  if (action === 'copy') {
    if (!shot) return showToast('该素材暂无图片可复制', 'warning');
    const url = await ensureOriginalBlob(item, shot) || window.blobCache[shot.id] || shot.dataUrl; // 🆕 v1.5：复制要原图
    if (!url) return showToast('图片资源未能读取，请确保已连接硬盘', 'warning');
    try {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob(b => navigator.clipboard.write([new ClipboardItem({'image/png': b})])
          .then(() => showToast('✅ 封面图已复制到剪贴板'))
          .catch(() => showToast('浏览器限制了剪贴板写入权限', 'error')));
      };
    } catch(e) { showToast('复制失败：' + e.message, 'error'); }
  }
  
  if (action === 'delete') {
    if (!confirm(`确认将「${item.title}」移入物理防丢回收站？`)) return;
    const trashObj = { id: uid(), type: 'item', data: item, deletedAt: Date.now() };
    if (dirHandle) await moveFs(dirHandle, getItemFolderPath(item), `已删除（回收站）/${sanitizeName(item.title)}_${item.id}`, false);
    DB.trash.push(trashObj); DB.items = DB.items.filter(i => i.id !== item.id);
    if (selectedId === ctxCardImgId) selectedId = null;
    ctxCardImgId = null;
    renderLibrary(); scheduleSave(); showToast('记录已移入回收站');
  }
}

/* ═══════════════════════════════════════════════════════
   VIEW 3: TRASH (物理防丢回收站)
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   VIEW 4: ANALYTICS (全局数据透视分析中心)
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   VIEW 5: TRASH (黑洞物理回收站修复与控制)
═══════════════════════════════════════════════════════ */
function renderTrashView() {
  const grid = document.getElementById('trash-grid');
  const e = document.getElementById('trash-empty-state');
  if(!grid || !e) return;
  
  const allT = DB.trash.slice().sort((a,b) => b.deletedAt - a.deletedAt);
  if(document.getElementById('trash-count')) document.getElementById('trash-count').textContent = allT.length + ' 项残骸';
  
  if (allT.length === 0) { grid.innerHTML = ''; e.style.display = 'flex'; updateTrashToolbar(); return; }
  e.style.display = 'none';
  
  grid.innerHTML = allT.map(t => {
    let title, imgHtml;
    if (t.type === 'item') {
      title = `[卡片崩塌] ${t.data.title}`;
      const pinned = (t.data.shots||[]).find(s=>s.pinned) || (t.data.shots||[])[0];
      imgHtml = pinned ? getShotImgHtml(pinned, '') : `<i class="ti ti-layout-grid" style="font-size:40px;color:var(--txm)"></i>`;
    } else {
      title = `[细胞碎片] 脱离自母体: ${t.originalTitle}`;
      imgHtml = getShotImgHtml(t.data, '');
    }
    const isSelected = trashSelectedIds.has(t.id);
    
    return `<div class="card trash-card ${isSelected ? 'trash-sel selected' : ''}" data-id="${t.id}" data-act="__h118" data-evt="click" data-act-args="${JSON.stringify([t.id]).replace(/"/g, "&quot;")}">
      <div class="trash-cb-wrap"><input type="checkbox" class="tc-cb" ${isSelected ? 'checked' : ''} data-act="__h119" data-evt="click" data-act-args="${JSON.stringify([t.id]).replace(/"/g, "&quot;")}"></div>
      <div class="card-thumb" style="background:var(--s3)">${imgHtml}</div>
      <div class="card-body">
        <div class="card-title" style="color:var(--dr)" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
        <div style="font-size:10px; color:var(--txm); margin-top:8px; border-top:1px dashed var(--bd); padding-top:6px;"><i class="ti ti-clock-x"></i> 处刑时间: ${new Date(t.deletedAt).toLocaleString()}</div>
      </div>
    </div>`;
  }).join('');
  updateTrashToolbar();
  loadTrashThumbnails(allT); // 🆕 v1.5：只有真正打开回收站视图时才去读这些图（懒加载），而不是开机就全部预加载
}

// 🆕 v1.5-fix：回收站封面懒加载。只加载滚动到视野附近的卡片封面（此前是打开视图就
// 逐张读完全部原图，见 A-02）。封面仍读原图（回收站不建缩略图缓存），但只读可见的。
let trashObserver = null;
function getTrashCoverShot(t) {
  if (t.type === 'item') return ((t.data.shots || []).find(s => s.pinned && s.type !== 'reel') || (t.data.shots || []).find(s => s.type !== 'reel')) || null;
  return (t.data && t.data.type !== 'reel') ? t.data : null;
}
async function loadTrashCoverInto(cardEl, entry) {
  const shot = getTrashCoverShot(entry);
  if (!shot) return;
  await ensureDisplayBlobTrash(entry, shot);
  const thumbEl = cardEl.querySelector('.card-thumb');
  if (thumbEl && window.blobCache[shot.id] && document.contains(cardEl)) thumbEl.innerHTML = getShotImgHtml(shot, '');
}
async function loadTrashThumbnails(entries) {
  if (trashObserver) { trashObserver.disconnect(); trashObserver = null; }
  const byId = new Map(entries.map(t => [t.id, t]));
  const rootEl = document.querySelector('#view-trash .grid-container');
  trashObserver = new IntersectionObserver((obsEntries, obs) => {
    obsEntries.forEach(en => {
      if (!en.isIntersecting) return;
      obs.unobserve(en.target);
      const entry = byId.get(en.target.getAttribute('data-id'));
      if (entry) loadTrashCoverInto(en.target, entry);
    });
  }, { root: rootEl || null, rootMargin: '800px 0px', threshold: 0.01 });
  document.querySelectorAll('#trash-grid .trash-card').forEach(el => {
    const entry = byId.get(el.getAttribute('data-id'));
    if (!entry) return;
    const shot = getTrashCoverShot(entry);
    if (!shot || window.blobCache[shot.id]) return;
    trashObserver.observe(el);
  });
}

function updateTrashToolbar() {
  const count = trashSelectedIds.size;
  if(document.getElementById('trash-sel-count')) document.getElementById('trash-sel-count').textContent = `准星已对准锁定 ${count} 个尸骸`;
  const chk = document.getElementById('trash-select-all');
  if (chk) chk.checked = (count > 0 && count === DB.trash.length);
  
  document.querySelectorAll('.trash-card').forEach(c => {
    const id = c.dataset.id; const isSel = trashSelectedIds.has(id);
    c.classList.toggle('trash-sel', isSel); c.classList.toggle('selected', isSel);
    const cb = c.querySelector('.tc-cb'); if (cb) cb.checked = isSel;
  });
}

function toggleTrashSelect(id) {
  if (trashSelectedIds.has(id)) trashSelectedIds.delete(id);
  else trashSelectedIds.add(id);
  updateTrashToolbar();
}

function toggleTrashSelectAll() {
  const chk = document.getElementById('trash-select-all');
  if(!chk) return;
  trashSelectedIds.clear();
  if (chk.checked) { DB.trash.forEach(t => trashSelectedIds.add(t.id)); }
  updateTrashToolbar();
}

async function restoreSelectedTrash() {
  if (trashSelectedIds.size === 0) return showToast('请先勾选需要还原的项目','warning');
  for (const tid of Array.from(trashSelectedIds)) {
    const idx = DB.trash.findIndex(x => x.id === tid);
    if (idx !== -1) {
      const t = DB.trash[idx];
      if (t.type === 'item') {
        if (dirHandle) await moveFs(dirHandle, `已删除（回收站）/${sanitizeName(t.data.title)}_${t.data.id}`, getItemFolderPath(t.data), false);
        DB.items.unshift(t.data);
      } else if (t.type === 'shot') {
        const item = DB.items.find(i => i.id === t.originalItemId);
        if (item) {
          if (dirHandle && t.data.type !== 'reel') await moveFs(dirHandle, `已删除（回收站）/${shotTrashFileName(t.data)}`, `${getItemFolderPath(item)}/${shotFileName(t.data)}`, true);
          item.shots.push(t.data);
        } else { showToast(`该图片所属的素材已被永久删除，请先一并勾选对应的素材再一起还原`, 'error'); continue; }
      }
      DB.trash.splice(idx, 1);
    }
  }
  trashSelectedIds.clear(); scheduleSave(); renderSidebarStats(); renderTrashView(); showToast('✅ 已成功还原，数据已恢复');
}

// 🆕 v1.3：永久删除二次确认弹窗（替代浏览器原生 prompt），返回 Promise<boolean>
let _confirmDeleteResolve = null;
function openConfirmDeleteModal(count) {
  const textEl = document.getElementById('confirm-delete-text');
  if (textEl) textEl.textContent = `⚠️ 即将永久删除 ${count} 项内容，硬盘上的原始文件也会被一并彻底删除，此操作不可恢复！`;
  const inp = document.getElementById('confirm-delete-input');
  if (inp) inp.value = '';
  const modal = document.getElementById('confirm-delete-modal');
  if (modal) modal.classList.add('show');
  return new Promise((resolve) => { _confirmDeleteResolve = resolve; });
}
function cancelConfirmDeleteModal() {
  const modal = document.getElementById('confirm-delete-modal');
  if (modal) modal.classList.remove('show');
  if (_confirmDeleteResolve) { _confirmDeleteResolve(false); _confirmDeleteResolve = null; }
}
function confirmConfirmDeleteModal() {
  const inp = document.getElementById('confirm-delete-input');
  const typed = inp ? inp.value.trim() : '';
  if (typed !== '删除') { showToast('输入内容不匹配，请重新输入「删除」两个字', 'warning'); return; }
  const modal = document.getElementById('confirm-delete-modal');
  if (modal) modal.classList.remove('show');
  if (_confirmDeleteResolve) { _confirmDeleteResolve(true); _confirmDeleteResolve = null; }
}

async function permanentDeleteSelectedTrash() {
  if (trashSelectedIds.size === 0) return;
  const count = trashSelectedIds.size;
  // 不可逆的物理删除操作，要求手动输入"删除"二字确认，比单纯点确定按钮更安全，避免手滑误删物理文件
  const confirmed = await openConfirmDeleteModal(count);
  if (!confirmed) return;
  for (const tid of Array.from(trashSelectedIds)) {
    const idx = DB.trash.findIndex(x => x.id === tid);
    if (idx !== -1) {
      const t = DB.trash[idx];
      if (dirHandle) {
        try {
          const dDir = await getDirHandleByPath(dirHandle, '已删除（回收站）', false);
          if (dDir) {
            if (t.type === 'item') await dDir.removeEntry(`${sanitizeName(t.data.title)}_${t.data.id}`, { recursive: true }).catch(() => { });
            else if (t.data.type !== 'reel') await dDir.removeEntry(shotTrashFileName(t.data)).catch(() => { });
          }
        } catch (e) { }
      }
      // 修复：彻底删除时同步释放内存中的 Object URL，避免 blobCache 泄漏
      if (t.type === 'item') revokeItemBlobs(t.data); else revokeShotBlob(t.data.id);
      DB.trash.splice(idx, 1);
    }
  }
  trashSelectedIds.clear(); scheduleSave(); renderSidebarStats(); renderTrashView(); showToast('✅ 已彻底删除，物理空间已释放');
}

// 🆕 v1.4：回收站自动清理。抽出跟上面手动"彻底删除"一致的物理清除逻辑，供自动清理复用，
// 区别只是不弹"输入删除二字确认"的对话框——因为这是用户自己在设置里主动开启的定时行为，不是一次性手滑操作。
async function purgeTrashEntriesByIds(ids) {
  let purged = 0;
  for (const tid of ids) {
    const idx = DB.trash.findIndex(x => x.id === tid);
    if (idx === -1) continue;
    const t = DB.trash[idx];
    if (dirHandle) {
      try {
        const dDir = await getDirHandleByPath(dirHandle, '已删除（回收站）', false);
        if (dDir) {
          if (t.type === 'item') await dDir.removeEntry(`${sanitizeName(t.data.title)}_${t.data.id}`, { recursive: true }).catch(() => { });
          else if (t.data.type !== 'reel') await dDir.removeEntry(shotTrashFileName(t.data)).catch(() => { });
        }
      } catch (e) { }
    }
    if (t.type === 'item') revokeItemBlobs(t.data); else revokeShotBlob(t.data.id);
    DB.trash.splice(idx, 1);
    purged++;
  }
  return purged;
}

// 🆕 v1.5-fix：单个回收站条目的磁盘占用（含量缩略图子目录），供按体积清理累减用。
async function getTrashEntrySize(t, dDir) {
  if (t.type === 'item') {
    const sub = await getDirHandleByPath(dDir, `${sanitizeName(t.data.title)}_${t.data.id}`, false);
    return sub ? await getDirSizeRecursive(sub, true) : 0;
  }
  if (t.data && t.data.type !== 'reel') {
    try { const fh = await dDir.getFileHandle(shotTrashFileName(t.data)); return (await fh.getFile()).size; }
    catch (e) { try { const fh2 = await dDir.getFileHandle(`${t.data.id}.${t.data.ext || 'jpg'}`); return (await fh2.getFile()).size; } catch (e2) { return 0; } }
  }
  return 0;
}

// 设置项：DB.settings.trashAutoClean = { enabled, days, sizeMB }（days/sizeMB 为 0 表示不启用该条件）
// 两个条件是"或"的关系：满足任意一个就清理，这样"保留天数"和"体积上限"可以按需只开一个或者两个都开。
async function runTrashAutoCleanIfNeeded() {
  const cfg = DB.settings.trashAutoClean;
  if (!cfg || !cfg.enabled || !DB.trash.length) return;
  let purgedCount = 0;

  // ① 按保留天数清理：超过设定天数没处理的回收站内容直接彻底清除
  if (cfg.days > 0) {
    const cutoff = Date.now() - cfg.days * 86400000;
    const expiredIds = DB.trash.filter(t => t.deletedAt < cutoff).map(t => t.id);
    if (expiredIds.length) purgedCount += await purgeTrashEntriesByIds(expiredIds);
  }

  // ② 按回收站占用体积清理：超出上限后，从最早删除的开始清。🆕 v1.5-fix：按“已删条目
  // 实际占用”累减，不再每清 5 项就把整个回收站目录重走一遍（见 A-08）。
  if (cfg.sizeMB > 0 && dirHandle) {
    try {
      const dDir = await getDirHandleByPath(dirHandle, '已删除（回收站）', false);
      if (dDir) {
        let totalBytes = await getDirSizeRecursive(dDir, true);
        const limitBytes = cfg.sizeMB * 1024 * 1024;
        const oldestFirst = DB.trash.slice().sort((a, b) => a.deletedAt - b.deletedAt);
        let guard = 0;
        while (totalBytes > limitBytes && oldestFirst.length && guard++ < 10000) {
          const batch = oldestFirst.splice(0, 5);
          let batchBytes = 0;
          for (const t of batch) {
            try { batchBytes += await getTrashEntrySize(t, dDir); } catch (e) {}
          }
          const ids = batch.map(t => t.id);
          const n = await purgeTrashEntriesByIds(ids);
          if (n === 0) break; // 保险丝，避免因意外情况死循环
          purgedCount += n;
          totalBytes = Math.max(0, totalBytes - batchBytes);
        }
      }
    } catch (e) { }
  }

  if (purgedCount > 0) {
    scheduleSave(); renderSidebarStats();
    if (currentView === 'trash') renderTrashView();
    showToast(`🧹 回收站自动清理：已彻底清除 ${purgedCount} 项过期/超量内容`, 'success');
  }
}

/* ═══════════════════════════════════════════════════════
   NINE GRID MODAL (高定无框画廊连选系统)
═══════════════════════════════════════════════════════ */
async function openNineGridModal(itemId) {
  const items = DB.items;
  const item = items.find(i => i.id === itemId); if (!item) return;
  
  currentNineGridItemId = itemId;
  nineGridSelectedIds.clear(); nineLastClickedIdx = -1; nineCtxCurrentIdx = -1;
  ensureDefaults();
  
  const total = (item.shots || []).filter(s => s.type !== 'reel').length;
  if(document.getElementById('nine-title')) document.getElementById('nine-title').textContent = `${item.title}`;
  
  if(document.getElementById('nine-col-quick')) document.getElementById('nine-col-quick').value = DB.settings.nineCols;
  if(document.getElementById('nine-rat-quick')) document.getElementById('nine-rat-quick').value = DB.settings.nineRatio;
  
  updateNineGridToolbar();
  if(document.getElementById('nine-grid-modal')) document.getElementById('nine-grid-modal').classList.add('show');
  renderNineGrid(); // 先渲染一次骨架（没加载到的图会显示占位图标），不用等图片加载完才弹窗
  // 🆕 v1.5：只在真正打开这个素材夹子时才去读它自己的图片（懒加载），而不是开机时全部读完
  await ensureItemDisplayBlobsLoaded(item, 'nine');
  if (currentNineGridItemId === itemId) renderNineGrid(); // 加载完再刷新一次真正显示图片；用户已经切走/关掉了就不用再刷
}

// 无框复选与 Shift 区间连选核心引擎
function handleNineItemClick(idx, event) {
  if (event.button !== 0) return; // 限定只响应鼠标左键，规避右键弹出菜单导致的选中混乱
  
  // Shift 区间连选魔法框架
  if (event.shiftKey && nineLastClickedIdx !== -1) {
    const min = Math.min(idx, nineLastClickedIdx);
    const max = Math.max(idx, nineLastClickedIdx);
    const items = DB.items;
    const item = items.find(i => i.id === currentNineGridItemId);
    if(item) {
        for (let i = min; i <= max; i++) { if (item.shots[i].type !== 'reel') nineGridSelectedIds.add(i); }
    }
  } else {
    // 正常单击反转选中状态
    if (nineGridSelectedIds.has(idx)) nineGridSelectedIds.delete(idx);
    else nineGridSelectedIds.add(idx);
    nineLastClickedIdx = idx;
  }
  
  // 2026-11-26：选中改绑 click（此前绑 mousedown，拖图出九宫格时 mousedown 先触发、把刚全选的图取消了勾选）。
  // 拖拽开始后浏览器不会再发 click，所以拖动不影响选中；只有真正点一下才切换选中。只切换 class，不动 DOM 结构，
  // 这样节点全程不被替换，双击等依赖同一节点的事件才能正常识别。
  updateNineItemSelectionUI();
  updateNineGridToolbar();
}

// 只更新选中态的视觉样式，不重建 DOM（配合上面的说明）
function updateNineItemSelectionUI() {
  const container = document.getElementById('nine-container');
  if (!container) return;
  container.querySelectorAll('.nine-item[data-nine-idx]').forEach(el => {
    const i = parseInt(el.getAttribute('data-nine-idx'), 10);
    el.classList.toggle('nine-selected', nineGridSelectedIds.has(i));
  });
}

function toggleNineSelectAll() {
  const items = DB.items;
  const item = items.find(i => i.id === currentNineGridItemId); if (!item) return;
  
  const valids = item.shots.map((s, i) => s.type !== 'reel' ? i : -1).filter(i => i !== -1);
  if (nineGridSelectedIds.size === valids.length) nineGridSelectedIds.clear();
  else valids.forEach(i => nineGridSelectedIds.add(i));
  
  renderNineGrid(); updateNineGridToolbar();
}

// 绑定最高优先级的 Ctrl+A / Cmd+A 快捷键全局监听
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    if (document.getElementById('nine-grid-modal') && document.getElementById('nine-grid-modal').classList.contains('show')) {
      e.preventDefault(); toggleNineSelectAll();
    } else if (currentView === 'lib' && !document.querySelector('.modal-overlay.show') && !(e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]'))) {
      // 🆕 2026-11-26：主界面 Ctrl+A 全选当前列表（当前分类／搜索筛出来的卡片）；输入框里按 Ctrl+A 还是选文字
      e.preventDefault(); selectAllLibItems();
    }
  }
  // 修复建议14：纯键盘操作补充方案 —— 恰好选中一张图片时，Ctrl+方向键 可以左右移动它的位置，不依赖鼠标拖拽
  if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const modalOpen = document.getElementById('nine-grid-modal') && document.getElementById('nine-grid-modal').classList.contains('show');
    if (modalOpen && nineGridSelectedIds.size === 1) {
      e.preventDefault();
      const item = DB.items.find(i => i.id === currentNineGridItemId); if (!item) return;
      const curIdx = Array.from(nineGridSelectedIds)[0];
      const targetIdx = e.key === 'ArrowLeft' ? curIdx - 1 : curIdx + 1;
      if (targetIdx < 0 || targetIdx >= item.shots.length) return;
      const [moved] = item.shots.splice(curIdx, 1);
      item.shots.splice(targetIdx, 0, moved);
      nineGridSelectedIds.clear(); nineGridSelectedIds.add(targetIdx);
      renderNineGrid(); updateNineGridToolbar(); scheduleSave();
    }
  }
});

function updateNineGridToolbar() {
  if(document.getElementById('nine-sel-count')) document.getElementById('nine-sel-count').textContent = nineGridSelectedIds.size;
  const items = DB.items;
  const item = items.find(i => i.id === currentNineGridItemId);
  const valids = item ? item.shots.map((s, i) => s.type !== 'reel' ? i : -1).filter(i => i !== -1) : [];
  
  // 共 X 张的总数同步刷新（上传/删除图片后都会调用本函数）
  if(document.getElementById('nine-total-count')) document.getElementById('nine-total-count').textContent = valids.length;
  
  const isAll = nineGridSelectedIds.size > 0 && nineGridSelectedIds.size === valids.length;
  if(document.getElementById('btn-nine-select-all')) {
      document.getElementById('btn-nine-select-all').innerHTML = isAll ? `<i class="ti ti-x"></i> 取消全选` : `<i class="ti ti-checks"></i> 全选`;
  }
}

let nineViewMode = 'grid';
let nineDragSrcIdx = null;
let nineDragIds = []; // 修复4：拖拽的一批 shot.id（支持多选批量拖拽排序）

function toggleNineViewMode() {
  nineViewMode = nineViewMode === 'grid' ? 'mindmap' : 'grid';
  const btn = document.getElementById('btn-nine-view-mode');
  if (btn) btn.innerHTML = nineViewMode === 'mindmap' ? '<i class="ti ti-layout-grid"></i> 网格视图' : '<i class="ti ti-sitemap"></i> 思维导图';
  const colWrap = document.getElementById('nine-col-wrap'), ratWrap = document.getElementById('nine-rat-wrap');
  if (colWrap) colWrap.style.display = nineViewMode === 'mindmap' ? 'none' : 'flex';
  if (ratWrap) ratWrap.style.display = nineViewMode === 'mindmap' ? 'none' : 'flex';
  renderNineGrid();
}

function nineDragStart(idx, e) {
  const item = (DB.items).find(i => i.id === currentNineGridItemId);
  if (item && nineGridSelectedIds.has(idx)) {
    // 拖动的是已选中的一张：把当前所有选中项作为一个整体一起拖动，实现批量排序
    nineDragIds = Array.from(nineGridSelectedIds).map(i => item.shots[i] && item.shots[i].id).filter(Boolean);
  } else {
    nineDragIds = (item && item.shots[idx]) ? [item.shots[idx].id] : [];
  }
  nineDragSrcIdx = idx; e.dataTransfer.effectAllowed = 'move'; e.target.classList.add('nine-dragging');
}
function nineDragEnd(e) { e.target.classList.remove('nine-dragging'); nineDragSrcIdx = null; nineDragIds = []; }
function nineDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function nineDrop(idx, e) {
  e.preventDefault();
  const item = DB.items.find(i => i.id === currentNineGridItemId);
  if (!item || !nineDragIds.length) { nineDragSrcIdx = null; nineDragIds = []; return; }
  const targetShot = item.shots[idx];
  if (!targetShot || nineDragIds.includes(targetShot.id)) { nineDragSrcIdx = null; nineDragIds = []; return; }

  // 以 shot.id 为准做整体块状搬移，避免多选拖拽时索引在过程中错位
  const draggedSet = new Set(nineDragIds);
  const draggedShots = item.shots.filter(s => draggedSet.has(s.id));
  const remaining = item.shots.filter(s => !draggedSet.has(s.id));
  const targetIdx = remaining.findIndex(s => s.id === targetShot.id);
  if (targetIdx === -1) { nineDragSrcIdx = null; nineDragIds = []; return; }
  remaining.splice(targetIdx, 0, ...draggedShots);
  item.shots = remaining;

  nineDragSrcIdx = null; nineDragIds = [];
  nineGridSelectedIds.clear();
  renderNineGrid(); updateNineGridToolbar(); renderDetailPanel(); scheduleSave();
  showToast('✅ 已调整图片顺序');
}

function renderNineGrid() {
  const items = DB.items;
  const item = items.find(i => i.id === currentNineGridItemId); if (!item) return;
  
  const container = document.getElementById('nine-container');
  if(!container) return;

  const visibleShots = (item.shots || []).filter(s => s.type !== 'reel');
  
  // 无图片时显示空状态提示
  if (visibleShots.length === 0) {
    container.style.gridTemplateColumns = '1fr';
    container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:var(--txm);gap:14px;">
      <i class="ti ti-photo-off" style="font-size:56px;opacity:0.35;"></i>
      <p style="font-size:13px;text-align:center;line-height:1.7;">该素材暂无任何图片<br>可在右侧面板上传，或直接按 <strong style="color:var(--tx)">Ctrl+V</strong> 粘贴图片</p>
      <button class="btn primary" style="height:34px;" data-act="__h120" data-evt="click" data-act-args="[]"><i class="ti ti-upload"></i> 立即上传图片</button>
    </div>`;
    return;
  }

  if (nineViewMode === 'mindmap') { container.classList.add('nine-container-mindmap'); renderNineMindmap(item, container); return; }
  container.classList.remove('nine-container-mindmap');
  
  container.style.gridTemplateColumns = `repeat(${DB.settings.nineCols}, 1fr)`;
  
  let styleStr = '';
  if (DB.settings.nineRatio !== 'auto') { try { const p = DB.settings.nineRatio.split('/'); styleStr = `aspect-ratio: ${(parseFloat(p[0]) / parseFloat(p[1])).toFixed(4)};`; } catch(e){} }
  
  container.innerHTML = (item.shots || []).map((s, idx) => {
    if (s.type === 'reel') return ''; // 九宫格矩阵中绝不显示纯视频卡片
    const isSel = nineGridSelectedIds.has(idx);
    
    return `<div class="nine-item ${isSel ? 'nine-selected' : ''}" style="${styleStr}" draggable="true" title="单击选中 / 双击或点放大镜查看大图" data-nine-idx="${idx}"
      data-act="__h121" data-evt="click" data-act-args="${JSON.stringify([idx]).replace(/"/g, "&quot;")}" 
      data-act2="__h122" data-evt2="dragstart" data-act-args2="${JSON.stringify([idx]).replace(/"/g, "&quot;")}" data-act3="__h123" data-evt3="dragend" data-act-args3="[]" data-act4="__h124" data-evt4="dragover" data-act-args4="[]" data-act5="__h125" data-evt5="drop" data-act-args5="${JSON.stringify([idx]).replace(/"/g, "&quot;")}"
      data-act6="__h126" data-evt6="contextmenu" data-act-args6="${JSON.stringify([idx]).replace(/"/g, "&quot;")}"
      data-act7="__h133" data-evt7="dblclick" data-act-args7="${JSON.stringify([item.id, idx]).replace(/"/g, "&quot;")}">
      
      ${getShotImgHtml(s, 'width:100%;height:100%;object-fit:cover; pointer-events:none;')}
      <div class="nine-zoom-hint" data-act="__h127" data-evt="mousedown" data-act-args="[]" data-act2="__h128" data-evt2="click" data-act-args2="${JSON.stringify([item.id, idx]).replace(/"/g, "&quot;")}" title="点击大图预览"><i class="ti ti-zoom-in"></i></div>
      <div class="nine-sel-icon"><i class="ti ti-check"></i></div>
      
      ${s.pinned ? `<div class="nine-badge-cover"><i class="ti ti-star"></i> 首选核心门面</div>` : ''}
    </div>`;
  }).join('');
}

// 思维导图展示模式：中间为封面图，左右两侧按日期分组展示上传批次
function renderNineMindmap(item, container) {
  container.style.gridTemplateColumns = '1fr';
  const shotsWithIdx = (item.shots || []).map((s, idx) => ({ s, idx })).filter(x => x.s.type !== 'reel');
  
  // 按日期分组
  const groups = {};
  shotsWithIdx.forEach(({ s, idx }) => {
    const d = dateStr8(s.addedAt || Date.now());
    if (!groups[d]) groups[d] = [];
    groups[d].push({ s, idx });
  });
  const dateKeys = Object.keys(groups).sort();
  
  const coverEntry = shotsWithIdx.find(x => x.s.pinned) || shotsWithIdx[0];
  const coverSrc = coverEntry ? getShotSrc(coverEntry.s) : '';
  
  const renderNode = (dateKey) => {
    const list = groups[dateKey];
    const visible = list.slice(0, 6);
    const extra = list.length - visible.length;
    const dLabel = `${dateKey.slice(0,4)}-${dateKey.slice(4,6)}-${dateKey.slice(6,8)}`;
    return `<div class="mindmap-node">
      <div class="mindmap-node-date"><i class="ti ti-calendar-event"></i> ${dLabel} · 共 ${list.length} 张</div>
      <div class="mindmap-thumbs">
        ${visible.map(({s, idx}) => `<div class="mindmap-thumb" data-act="__h129" data-evt="click" data-act-args="${JSON.stringify([item.id, idx]).replace(/"/g, "&quot;")}" title="点击预览">${getShotImgHtml(s, 'width:100%;height:100%;object-fit:cover;')}</div>`).join('')}
        ${extra > 0 ? `<div class="mindmap-thumb more">+${extra}</div>` : ''}
      </div>
    </div>`;
  };
  
  const leftKeys = dateKeys.filter((_, i) => i % 2 === 0);
  const rightKeys = dateKeys.filter((_, i) => i % 2 === 1);
  
  container.innerHTML = `<div class="mindmap-wrap">
    <div class="mindmap-col left">${leftKeys.map(renderNode).join('')}</div>
    <div class="mindmap-center">
      <div class="mindmap-spine"></div>
      ${coverSrc ? `<img class="mindmap-center-img" src="${coverSrc}">` : `<div class="mindmap-center-img" style="width:280px;height:280px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-photo" style="font-size:40px;color:var(--txm)"></i></div>`}
      <div class="mindmap-center-label">${item.title}</div>
    </div>
    <div class="mindmap-col right">${rightKeys.map(renderNode).join('')}</div>
  </div>`;
}

function closeNineGridModal() { if(document.getElementById('nine-grid-modal')) document.getElementById('nine-grid-modal').classList.remove('show'); }

// 画廊单图独立右键暗网系统控制台
async function handleNineCtx(action) {
  if(document.getElementById('ctx-nine')) document.getElementById('ctx-nine').classList.remove('show');

  const item = DB.items.find(x => x.id === currentNineGridItemId);
  if (!item || nineCtxCurrentIdx === -1) return;
  
  const shot = item.shots[nineCtxCurrentIdx];
  // 若当前右键点击的图片本身在多选范围内，且多选数量 > 1，则视为"批量操作"
  const isBatch = nineGridSelectedIds.size > 1 && nineGridSelectedIds.has(nineCtxCurrentIdx);
  const targetIdxs = isBatch ? Array.from(nineGridSelectedIds) : [nineCtxCurrentIdx];
  
  if (action === 'delete') {
    for (const idx of targetIdxs.slice().sort((a,b)=>b-a)) {
      const s = item.shots[idx]; if (!s || s.type === 'reel') continue;
      if (dirHandle) await moveFs(dirHandle, `${getItemFolderPath(item)}/${shotFileName(s)}`, `已删除（回收站）/${shotTrashFileName(s)}`, true);
      DB.trash.push({ id: uid(), type: 'shot', data: s, originalItemId: item.id, originalTitle: item.title, deletedAt: Date.now() });
      item.shots.splice(idx, 1);
    }
    if (item.shots.length && !item.shots.some(x => x.pinned)) item.shots[0].pinned = true;
    nineGridSelectedIds.clear();
    
    scheduleSave(); renderNineGrid(); updateNineGridToolbar(); renderDetailPanel(); renderLibraryGrid();
    showToast(isBatch ? `✅ 已批量移入回收站，共 ${targetIdxs.length} 张` : '✅ 该图片已移入回收站');
  }
  
  if (action === 'pin') {
    setPinnedShotAndReorder(item, nineCtxCurrentIdx);
    nineGridSelectedIds.clear(); nineCtxCurrentIdx = -1; // 数组顺序已变化，清空索引缓存避免后续误选
    scheduleSave(); renderNineGrid(); renderDetailPanel(); renderLibraryGrid();
    showToast('⭐ 已设为该素材的专属封面');
  }
  
  if (action === 'save') {
    if (isBatch) {
      showToast(`📦 正在打包 ${targetIdxs.length} 张图片...`, 'success');
      try {
        const zip = new JSZip();
        let fc = 0;
        for (const idx of targetIdxs) {
          const s = item.shots[idx]; if (!s || s.type === 'reel') continue;
          const url = await ensureOriginalBlob(item, s) || window.blobCache[s.id] || s.dataUrl; if (!url) continue; // 🆕 v1.5：打包保存要原图
          const resp = await fetch(url); const blob = await resp.blob();
          zip.file(`${sanitizeName(item.title)}_${fc+1}.${s.ext||'jpg'}`, blob); fc++;
        }
        const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = `${sanitizeName(item.title)}-${dateStr8(Date.now())}.zip`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } catch(e) { showToast('打包失败：' + e.message, 'error'); }
    } else {
      const url = await ensureOriginalBlob(item, shot) || window.blobCache[shot.id] || shot.dataUrl; // 🆕 v1.5：单张保存要原图
      if (url) { const a = document.createElement('a'); a.href = url; a.download = `${sanitizeName(item.title)}_单独切面提取备份.${shot.ext || 'jpg'}`; a.click(); }
    }
  }
  
  if (action === 'copy') {
    try {
      const clipItems = [];
      const failedSeqs = []; // 修复建议13：记录复制失败的具体张数，而不是只说成功了几张
      let seq = 0;
      for (const idx of targetIdxs) {
        seq++;
        const s = item.shots[idx]; if (!s || s.type === 'reel') continue;
        const url = await ensureOriginalBlob(item, s) || window.blobCache[s.id] || s.dataUrl; if (!url) { failedSeqs.push(seq); continue; } // 🆕 v1.5：复制要原图
        const blob = await new Promise((resolve) => {
          const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
          img.onload = () => {
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            c.toBlob(b => resolve(b));
          };
          img.onerror = () => resolve(null);
        });
        if (blob) clipItems.push(new ClipboardItem({'image/png': blob})); else failedSeqs.push(seq);
      }
      if (!clipItems.length) return showToast('未能读取到有效图片数据', 'error');
      await navigator.clipboard.write(clipItems);
      let msg = clipItems.length > 1 ? `✅ 已将 ${clipItems.length} 张图片复制到系统剪贴板` : '✅ 已复制到系统剪贴板';
      if (failedSeqs.length) msg += `（其中第 ${failedSeqs.join('、')} 张读取失败，未能复制）`;
      showToast(msg, failedSeqs.length ? 'warning' : 'success');
    } catch(e) { showToast('浏览器安全限制导致复制失败，可以尝试右键另存图片', 'error'); }
  }
}

// 批量导出 ZIP 包引擎
async function exportNineGridSelected() {
  if (nineGridSelectedIds.size === 0) return showToast('请先选中需要打包的图片', 'warning');
  const items = DB.items;
  const item = items.find(i => i.id === currentNineGridItemId); if (!item) return;
  
  showToast(`📦 正在打包 ${nineGridSelectedIds.size} 张图片，请稍候...`, 'success');
  
  try {
    const zip = new JSZip();
    const now = new Date();
    const dateStr = `${pad2(now.getMonth()+1)}${pad2(now.getDate())}`;
    const zipName = `${sanitizeName(item.title)}-${dateStr}.zip`;
    
    let fileCount = 0;
    for (const idx of nineGridSelectedIds) {
      const shot = item.shots[idx];
      if (!shot || shot.type === 'reel') continue;
      const url = await ensureOriginalBlob(item, shot) || window.blobCache[shot.id] || shot.dataUrl; // 🆕 v1.5：打包导出要原图
      if (!url) continue;
      
      try {
        let blob;
        if (url.startsWith('blob:')) {
          const resp = await fetch(url);
          blob = await resp.blob();
        } else if (url.startsWith('data:')) {
          const arr = url.split(','); const mime = arr[0].match(/:(.*?);/)[1];
          const bStr = atob(arr[1]); const n = bStr.length;
          const u8 = new Uint8Array(n); for(let k=0;k<n;k++) u8[k]=bStr.charCodeAt(k);
          blob = new Blob([u8], {type: mime});
        } else continue;
        
        const ext = shot.ext || 'jpg';
        zip.file(`${sanitizeName(item.title)}_${fileCount+1}.${ext}`, blob);
        fileCount++;
      } catch(e) {}
    }
    
    if (fileCount === 0) return showToast('未能读取到有效图片数据', 'error');
    
    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = zipName; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    
    nineGridSelectedIds.clear(); renderNineGrid(); updateNineGridToolbar();
    showToast(`✅ 已打包 ${fileCount} 张图片 → ${zipName}`);
  } catch(e) {
    showToast('打包失败：' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════
   LIGHTBOX (单图极致沉浸放大系统)
═══════════════════════════════════════════════════════ */
function openGallery(itemId, idx) {
  const items = DB.items;
  const item = items.find(i => i.id === itemId); if (!item) return;
  galleryItemId = itemId;
  galleryShots = (item.shots || []).filter(s => s.type !== 'reel'); // 排掉视频废件不渲染
  if (galleryShots.length === 0) return;
  
  // 修正点击的序号偏移（由于踢出了视频产生的底层数组索引差异）
  const rawShot = item.shots[idx];
  galleryIndex = galleryShots.findIndex(s => s.id === rawShot.id);
  if (galleryIndex === -1) galleryIndex = 0;
  
  resetGalleryZoom();
  renderLightbox(); if(document.getElementById('lightbox')) document.getElementById('lightbox').classList.add('show');
}

function renderLightbox() {
  const s = galleryShots[galleryIndex]; if (!s) return;
  resetGalleryZoom(); // 🆕 v1.3：切换图片时重置缩放，避免带着上一张的放大倍数看新图
  const imgEl = document.getElementById('lightbox-img');
  if (imgEl) {
    // 🆕 v1.5：放大查看必须是原图质量（尤其配合滚轮缩放看细节，缩略图放大会糊）。
    // 先用已经有的缩略图/缓存垫一下（切图不留白），原图读好了再无感换上去。
    imgEl.src = window.origBlobCache[s.id] || window.blobCache[s.id] || s.dataUrl || '';
    if (!window.origBlobCache[s.id]) {
      const item = DB.items.find(i => i.id === galleryItemId);
      ensureOriginalBlob(item, s).then(url => {
        if (url && galleryShots[galleryIndex] === s && document.getElementById('lightbox-img')) {
          document.getElementById('lightbox-img').src = url;
        }
      });
    }
  }
  if(document.getElementById('lightbox-counter')) document.getElementById('lightbox-counter').textContent = `${galleryIndex + 1} / ${galleryShots.length}`;
  if(document.getElementById('lightbox-strip')) {
      // 🆕 v1.5-fix2：缩略条只渲染当前前后各 15 张（此前全量），切图时把当前缩略图滚到中间。
      const stripStart = Math.max(0, galleryIndex - 15);
      const stripEnd = Math.min(galleryShots.length, galleryIndex + 16);
      const stripEl = document.getElementById('lightbox-strip');
      stripEl.innerHTML = galleryShots.slice(stripStart, stripEnd).map((shot, k) => {
        const i = stripStart + k;
        return `<div class="lb-strip-thumb ${i === galleryIndex ? 'active' : ''}" data-act="__h130" data-evt="click" data-act-args="${JSON.stringify([i]).replace(/"/g, "&quot;")}">${getShotImgHtml(shot, 'width:100%;height:100%;object-fit:cover; pointer-events:none;')}</div>`;
      }).join('');
      const act = stripEl.querySelector('.lb-strip-thumb.active');
      if (act) { try { act.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }
  }
}

function navGallery(dir, e) { if(e) e.stopPropagation(); if (galleryShots.length) { galleryIndex = (galleryIndex + dir + galleryShots.length) % galleryShots.length; renderLightbox(); } }
function closeLightbox() { if(document.getElementById('lightbox')) document.getElementById('lightbox').classList.remove('show'); resetGalleryZoom(); }

// 🆕 v1.3：大图查看模式下，鼠标滚轮缩放查看细节（左右切图、关闭等其他交互保持不变）
let galleryZoom = 1;
const GALLERY_ZOOM_MIN = 1, GALLERY_ZOOM_MAX = 4, GALLERY_ZOOM_STEP = 0.15;
function resetGalleryZoom() {
  galleryZoom = 1;
  const img = document.getElementById('lightbox-img');
  if (img) { img.style.transform = 'scale(1)'; img.style.cursor = 'zoom-in'; }
}
(function initGalleryWheelZoom() {
  const img = document.getElementById('lightbox-img');
  if (!img) return; // 静态元素，页面加载时就存在，此处一次性绑定即可，无需在每次 renderLightbox 时重复绑定
  img.addEventListener('wheel', function (e) {
    e.preventDefault(); e.stopPropagation();
    const delta = e.deltaY > 0 ? -GALLERY_ZOOM_STEP : GALLERY_ZOOM_STEP;
    galleryZoom = Math.min(GALLERY_ZOOM_MAX, Math.max(GALLERY_ZOOM_MIN, galleryZoom + delta));
    img.style.transform = `scale(${galleryZoom.toFixed(2)})`;
    img.style.cursor = galleryZoom > 1 ? 'zoom-out' : 'zoom-in';
  }, { passive: false });
})();

document.addEventListener('click', e => { 
  if(e.target.id === 'lightbox') closeLightbox(); 
  document.querySelectorAll('.ctx-menu').forEach(m => m.classList.remove('show')); 
});

/* ═══════════════════════════════════════════════════════
   MODALS: ADD / EDIT / CATEGORY LOGIC
═══════════════════════════════════════════════════════ */
function openAddModal() {
  if (!dirHandle) { showToast('🚨 必须先连接本地文件夹，才能新增素材档案！', 'error'); return; }
  editingItemId = null; formTags = [];
  if(document.getElementById('f-title')) document.getElementById('f-title').value = ''; 
  // 智能识别：如果当前正停留在某个具体分类目录里，新增素材时自动预选该分类，无需重复手动选择
  const smartCatId = (currentFilter && currentFilter.type === 'category') ? currentFilter.value : '';
  selectCategoryOption(smartCatId);
  if(document.getElementById('add-modal-title')) document.getElementById('add-modal-title').innerHTML = '新增素材档案';
  renderFormTags(); if(document.getElementById('add-modal')) document.getElementById('add-modal').classList.add('show');
}

function openEditModal(isCtx = false) {
  const id = isCtx ? ctxCardId : selectedId; const it = DB.items.find(x => x.id === id); if (!it) return;
  editingItemId = it.id; formTags = [...(it.tags || [])];
  
  if(document.getElementById('f-title')) document.getElementById('f-title').value = it.title;
  selectCategoryOption(it.categoryId || '');
  if(document.getElementById('add-modal-title')) document.getElementById('add-modal-title').innerHTML = '编辑素材属性';
  renderFormTags(); if(document.getElementById('add-modal')) document.getElementById('add-modal').classList.add('show');
}
function closeItemModal() { if(document.getElementById('add-modal')) document.getElementById('add-modal').classList.remove('show'); const l = document.getElementById('f-category-list'); if (l) l.classList.remove('show'); const ts = document.getElementById('tag-suggest-list'); if (ts) ts.classList.remove('show'); }

function renderFormTags() {
  const wrap = document.getElementById('tag-input-wrap'); if(!wrap) return;
  Array.from(wrap.querySelectorAll('.tag-chip')).forEach(e => e.remove());
  formTags.forEach((t, i) => {
    const d = document.createElement('div'); d.className = 'tag-chip';
    // 安全审计 2026-11-26（S-02）：标签是用户输入，直接拼 innerHTML 会注入脚本，改为转义后拼接。
    d.innerHTML = `${escapeHtml(t)} <i class="ti ti-x tag-chip-del" data-act="__h131" data-evt="click" data-act-args="${JSON.stringify([i]).replace(/"/g, "&quot;")}"></i>`;
    wrap.insertBefore(d, document.getElementById('tag-text-input'));
  });
}
if(document.getElementById('tag-text-input')) document.getElementById('tag-text-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault(); const v = e.target.value.trim().replace(/,$/, '');
    if (v && !formTags.includes(v)) { formTags.push(v); renderFormTags(); }
    e.target.value = '';
    renderTagSuggestions();
  }
});

// 🆕 v1.4：标签自动补全 / 热门标签推荐。
// 打分规则：同分类下用过的标签优先（权重 x3），其次按全局使用频率排序；已经加过的标签不会重复推荐。
function computeTagSuggestions(prefix, limit) {
  limit = limit || 9;
  const catEl = document.getElementById('f-category');
  const catId = catEl ? catEl.value : '';
  const freqAll = {}, freqCat = {};
  DB.items.forEach(it => {
    (it.tags || []).forEach(t => {
      freqAll[t] = (freqAll[t] || 0) + 1;
      if (catId && it.categoryId === catId) freqCat[t] = (freqCat[t] || 0) + 1;
    });
  });
  const p = (prefix || '').trim().toLowerCase();
  const candidates = Object.keys(freqAll).filter(t => !formTags.includes(t) && (!p || t.toLowerCase().includes(p)));
  candidates.sort((a, b) => ((freqCat[b]||0)*3 + freqAll[b]) - ((freqCat[a]||0)*3 + freqAll[a]));
  return candidates.slice(0, limit);
}
function renderTagSuggestions() {
  const list = document.getElementById('tag-suggest-list'); if (!list) return;
  const input = document.getElementById('tag-text-input');
  const suggestions = computeTagSuggestions(input ? input.value : '');
  if (!suggestions.length) { list.classList.remove('show'); return; }
  list.innerHTML = suggestions.map(t => `<div class="custom-select-option" data-act="__h134" data-evt="click" data-act-args="${JSON.stringify([t]).replace(/"/g, "&quot;")}"><i class="ti ti-tag" style="font-size:12px;color:var(--txm);margin-right:4px;"></i>${escapeHtml(t)}</div>`).join('');
  positionTagSuggestList();
  list.classList.add('show');
}
function positionTagSuggestList() {
  const trigger = document.getElementById('tag-input-wrap');
  const list = document.getElementById('tag-suggest-list');
  if (!trigger || !list) return;
  const r = trigger.getBoundingClientRect();
  const margin = 8;
  list.style.left = Math.max(margin, r.left) + 'px';
  list.style.width = r.width + 'px';
  const spaceBelow = window.innerHeight - r.bottom - margin;
  const spaceAbove = r.top - margin;
  if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
    list.style.top = (r.bottom + 4) + 'px'; list.style.bottom = 'auto';
    list.style.maxHeight = Math.max(120, Math.min(260, spaceBelow)) + 'px';
  } else {
    list.style.top = 'auto'; list.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    list.style.maxHeight = Math.max(120, Math.min(260, spaceAbove)) + 'px';
  }
}
function pickTagSuggestion(t) {
  if (!formTags.includes(t)) { formTags.push(t); renderFormTags(); }
  const input = document.getElementById('tag-text-input');
  if (input) { input.value = ''; input.focus(); }
  renderTagSuggestions();
}
(function bindTagSuggestEvents() {
  const input = document.getElementById('tag-text-input');
  if (input) { input.addEventListener('focus', renderTagSuggestions); input.addEventListener('input', renderTagSuggestions); }
})();
document.addEventListener('click', e => {
  const wrap = document.getElementById('tag-input-wrap');
  const list = document.getElementById('tag-suggest-list');
  const insideWrap = wrap && wrap.contains(e.target);
  const insideList = list && list.contains(e.target);
  if (!insideWrap && !insideList) { if (list) list.classList.remove('show'); }
});
document.addEventListener('scroll', function (e) {
  const list = document.getElementById('tag-suggest-list');
  if (list && list.classList.contains('show') && e.target !== list) list.classList.remove('show');
}, true);
window.addEventListener('resize', function () {
  const list = document.getElementById('tag-suggest-list');
  if (list && list.classList.contains('show')) list.classList.remove('show');
});

// 素材改名时使用：不仅把物理文件夹改名，还把文件夹内每张图片的文件名前缀也同步改成新标题，
// 保证在文件管理器里手动查看时，文件夹名和里面的文件名都是一致的最新标题
async function renameItemFolderWithFiles(item, oldPath, newPath) {
  const sParts = oldPath.split('/'); const sName = sParts.pop();
  const sDir = await getDirHandleByPath(dirHandle, sParts.join('/'), false); if (!sDir) return false;
  const dParts = newPath.split('/'); const dName = dParts.pop();
  const dParentDir = await getDirHandleByPath(dirHandle, dParts.join('/'), true); if (!dParentDir) return false;
  try {
    const srcHandle = await sDir.getDirectoryHandle(sName);
    const destHandle = await dParentDir.getDirectoryHandle(dName, { create: true });
    let seq = 0;
    for (const shot of item.shots || []) {
      if (shot.type === 'reel') continue;
      seq++;
      const oldFName = shotFileName(shot);
      let fh;
      try { fh = await srcHandle.getFileHandle(oldFName); } catch(e) { continue; } // 找不到对应原文件就跳过，不阻断整体流程
      const file = await fh.getFile();
      const newFName = buildShotFileName(item, shot, seq); // 此时 item.title 已经是新标题，文件名会自动带上新前缀
      const w = await (await destHandle.getFileHandle(newFName, { create: true })).createWritable();
      await w.write(file); await w.close();
      shot.fileName = newFName;
    }
    await sDir.removeEntry(sName, { recursive: true }).catch(() => {});
    return true;
  } catch(e) { return false; }
}

async function saveItemModal() {
  const tEl = document.getElementById('f-title');
  const t = tEl ? tEl.value.trim() : ''; if (!t) return showToast('标题必填', 'error');
  const cId = document.getElementById('f-category') ? document.getElementById('f-category').value : '';
  
  if (isDuplicateItemTitle(t, cId, editingItemId)) {
    return showToast(`❌ 该分类下已存在同名素材「${t}」，请更换一个名称`, 'error');
  }
  
  if (editingItemId) {
    const it = DB.items.find(x => x.id === editingItemId);
    pushUndoSnapshot(editingItemId, '编辑素材信息'); // 修复建议4：编辑前记录撤销快照
    const oldPath = getItemFolderPath(it);
    const prevTitle = it.title, prevCat = it.categoryId;
    const prevFileNames = (it.shots || []).map(s => s.fileName); // 用于搬迁失败时回滚文件名
    const titleChanged = it.title !== t;
    it.title = t; it.categoryId = cId; it.tags = [...formTags];
    const newPath = getItemFolderPath(it);
    if (dirHandle && oldPath !== newPath) {
      // 标题变了：连文件夹内每张图片的文件名前缀也一起同步改新；只是换分类目录：单纯搬迁文件夹即可，不用碰文件名
      const ok = titleChanged
        ? await renameItemFolderWithFiles(it, oldPath, newPath)
        : await moveFs(dirHandle, oldPath, newPath, false);
      if (!ok) {
        // 物理搬迁失败：回滚素材标题/分类/文件名，避免数据库与硬盘路径脱节导致图片"损坏"
        it.title = prevTitle; it.categoryId = prevCat;
        (it.shots || []).forEach((s, i) => { s.fileName = prevFileNames[i]; });
        showToast('❌ 物理文件夹搬迁失败，素材修改未生效，请检查硬盘权限后重试', 'error');
        return;
      }
      // 立即固化保存，避免防抖延迟期间刷新/断电导致物理路径与数据库记录不一致
      await saveToFolder();
      // 🆕 v1.5：文件夹搬迁只是换了磁盘路径，内存里已经缓存的 Blob URL 仍然有效，不需要重新加载
    }
  } else {
    if (!dirHandle) { showToast('🚨 必须先连接本地文件夹，才能保存新素材！', 'error'); return; }
    const it = { id: uid(), title: t, categoryId: cId, tags: [...formTags], links: [], shots: [], createdAt: Date.now() };
    DB.items.unshift(it); selectedId = it.id;
    await getDirHandleByPath(dirHandle, getItemFolderPath(it), true);
  }
  closeItemModal(); switchView('lib'); scheduleSave();

  // 修复建议11：同分类内已阻止重名，这里针对"跨分类同名"给一个不阻断操作的轻提示，避免用户混淆到底是哪一个
  const sameNameElsewhere = DB.items.some(it => it.id !== editingItemId && it.categoryId !== cId && (it.title||'').trim().toLowerCase() === t.toLowerCase());
  if (sameNameElsewhere) showToast(`ℹ️ 提示：其他分类下也存在同名素材「${t}」，注意区分`, 'warning');
}

let quickAddCategoryTarget = false;
// 修复：自定义分类下拉选择器逻辑（原生 select 的下拉列表高度无法可靠跨浏览器控制，改用自定义列表）
function toggleCategoryDropdown() {
  const list = document.getElementById('f-category-list'); if (!list) return;
  const willShow = !list.classList.contains('show');
  list.classList.toggle('show');
  if (willShow) positionCategoryDropdown();
}
// 🆕 v1.3：下拉列表改为 position:fixed，坐标由触发按钮的实际屏幕位置动态计算，
// 这样无论外层弹窗多小、是否可滚动，列表都能完整显示在触发按钮正下方（空间不够则自动改往上展开），不会被裁切或压住下面的表单。
function positionCategoryDropdown() {
  const trigger = document.getElementById('f-category-trigger');
  const list = document.getElementById('f-category-list');
  if (!trigger || !list) return;
  const r = trigger.getBoundingClientRect();
  const margin = 8;
  list.style.left = Math.max(margin, r.left) + 'px';
  list.style.width = r.width + 'px';
  const spaceBelow = window.innerHeight - r.bottom - margin;
  const spaceAbove = r.top - margin;
  if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
    list.style.top = (r.bottom + 4) + 'px';
    list.style.bottom = 'auto';
    list.style.maxHeight = Math.max(160, Math.min(360, spaceBelow)) + 'px';
  } else {
    list.style.top = 'auto';
    list.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    list.style.maxHeight = Math.max(160, Math.min(360, spaceAbove)) + 'px';
  }
}
// 弹窗内容滚动、或窗口尺寸变化时，触发按钮的位置会跟着变，此时直接收起下拉列表（比实时跟随更稳妥，不会有位置误差）
document.addEventListener('scroll', function (e) {
  const list = document.getElementById('f-category-list');
  if (list && list.classList.contains('show') && e.target !== list) list.classList.remove('show');
}, true);
window.addEventListener('resize', function () {
  const list = document.getElementById('f-category-list');
  if (list && list.classList.contains('show')) list.classList.remove('show');
});
function renderCategoryDropdown(selectedId) {
  const list = document.getElementById('f-category-list'); if (!list) return;
  const options = [{ id: '', name: '无分类归属' }, ...DB.categories, { id: '__new_category__', name: '+ 新建目录…' }];
  // 安全审计 2026-11-26（S-03）：分类名是用户输入，直接拼 innerHTML 会注入脚本，改为转义后拼接。
  list.innerHTML = options.map(c => `<div class="custom-select-option${c.id === (selectedId || '') ? ' active' : ''}" data-act="__h132" data-evt="click" data-act-args="${JSON.stringify([c.id]).replace(/"/g, "&quot;")}">${escapeHtml(c.name)}</div>`).join('');
}
function selectCategoryOption(id) {
  if (id === '__new_category__') {
    document.getElementById('f-category-list').classList.remove('show');
    handleCategorySelectChange({ value: '__new_category__' });
    return;
  }
  if(document.getElementById('f-category')) document.getElementById('f-category').value = id;
  const cat = DB.categories.find(c => c.id === id);
  if(document.getElementById('f-category-trigger-text')) document.getElementById('f-category-trigger-text').textContent = cat ? cat.name : '无分类归属';
  const list = document.getElementById('f-category-list'); if (list) { list.classList.remove('show'); renderCategoryDropdown(id); }
}
// 🆕 v1.4：#f-category-list 现在是顶层节点、不再是 #f-category-wrap 的子元素（见上方挪动位置的说明），
// 所以这里的"点击外部即收起"判断要同时把列表本身算作"内部"，否则点选项那一下会先被这里判定成"点了外部"而误关。
document.addEventListener('click', e => {
  const wrap = document.getElementById('f-category-wrap');
  const list = document.getElementById('f-category-list');
  const insideWrap = wrap && wrap.contains(e.target);
  const insideList = list && list.contains(e.target);
  if (!insideWrap && !insideList) { if (list) list.classList.remove('show'); }
});
function handleCategorySelectChange(sel) {
  if (sel.value === '__new_category__') {
    const revertId = editingItemId ? (DB.items.find(x=>x.id===editingItemId)||{}).categoryId||'' : '';
    if(document.getElementById('f-category')) document.getElementById('f-category').value = revertId;
    const cat = DB.categories.find(c => c.id === revertId);
    if(document.getElementById('f-category-trigger-text')) document.getElementById('f-category-trigger-text').textContent = cat ? cat.name : '无分类归属';
    openAddCategoryModal(true);
  }
}
function openAddCategoryModal(fromQuickAdd = false) {
  if (!dirHandle) { showToast('🚨 必须先连接本地文件夹，才能新建分类目录！', 'error'); return; }
  ctxCatId = null; quickAddCategoryTarget = fromQuickAdd; if(document.getElementById('f-cat-name')) document.getElementById('f-cat-name').value = ''; if(document.getElementById('cat-modal')) document.getElementById('cat-modal').classList.add('show'); }
async function saveCatModal() {
  const n = document.getElementById('f-cat-name') ? document.getElementById('f-cat-name').value.trim() : ''; if (!n) return;
  let newCatId = null;
  
  if (isDuplicateCategoryName(n, ctxCatId)) {
    return showToast(`❌ 分类名称「${n}」已存在，请更换一个名称`, 'error');
  }
  
  if (ctxCatId) {
    const c = DB.categories.find(x => x.id === ctxCatId);
    if (c && c.name !== n) {
      const oCat = sanitizeName(c.name); const nCat = sanitizeName(n);
      const oldName = c.name;
      if (dirHandle) {
        const iMs = DB.items.filter(i => i.categoryId === c.id);
        // 先尝试物理搬迁文件夹，全部成功后才提交改名，避免物理文件与数据库脱节
        let allOk = true;
        const oldPaths = iMs.map(iM => `素材截图/${oCat}/${sanitizeName(iM.title)}_${iM.id}`);
        const newPaths = iMs.map(iM => `素材截图/${nCat}/${sanitizeName(iM.title)}_${iM.id}`);
        let movedCount = 0;
        for (let i = 0; i < iMs.length; i++) {
          const ok = await moveFs(dirHandle, oldPaths[i], newPaths[i], false);
          if (!ok) { allOk = false; break; }
          movedCount++;
        }
        if (!allOk) {
          // 回滚：把已经搬迁成功的文件夹搬回原位，确保物理文件与数据库状态保持一致
          for (let i = 0; i < movedCount; i++) { await moveFs(dirHandle, newPaths[i], oldPaths[i], false); }
          showToast('❌ 物理文件夹搬迁失败，分类名称未修改，请检查硬盘权限后重试', 'error');
          return;
        }
        c.name = n;
        const oDir = await getDirHandleByPath(dirHandle, `素材截图/${oCat}`, false);
        if (oDir) { let emp = true; for await (const e of oDir.entries()) { emp = false; break; } if (emp) await (await getDirHandleByPath(dirHandle, '素材截图')).removeEntry(oCat).catch(()=>{}); }
        // 立即固化保存，避免防抖延迟期间刷新/断电导致物理路径与数据库记录不一致
        await saveToFolder();
        // 🆕 v1.5：同上，文件夹搬迁不影响内存里已缓存的 Blob URL
      } else {
        c.name = n;
      }
    }
  } else { newCatId = uid(); DB.categories.push({ id: newCatId, name: n }); }
  if(document.getElementById('cat-modal')) document.getElementById('cat-modal').classList.remove('show'); 
  scheduleSave(); 
  if(typeof renderSidebarStats === 'function') renderSidebarStats();
  if (currentView === 'lib') renderLibrary();
  if (quickAddCategoryTarget && newCatId) {
    if (document.getElementById('f-category')) selectCategoryOption(newCatId);
  }
  quickAddCategoryTarget = false;
}

/* ═══════════════════════════════════════════════════════
   SYSTEM EXPORT (大基建报表输出与数据脱出)
═══════════════════════════════════════════════════════ */
function openExport() { if(document.getElementById('export-modal')) document.getElementById('export-modal').classList.add('show'); }

function exportJSON() {
  const exp = { items: DB.items, categories: DB.categories, accounts: DB.accounts, trash: DB.trash, settings: DB.settings, version: DB.version, exportedAt: new Date().toISOString() };
  downloadText(JSON.stringify(exp, null, 2), `素材参考库备份_${Date.now()}.json`, 'application/json');
  if(document.getElementById('export-modal')) document.getElementById('export-modal').classList.remove('show'); showToast('✅ JSON 数据已导出');
}
function exportWSJSON() {
  const exp = { workspace: WS, exportedAt: new Date().toISOString() };
  downloadText(JSON.stringify(exp, null, 2), `工作台备份_${Date.now()}.json`, 'application/json');
  if(document.getElementById('export-modal')) document.getElementById('export-modal').classList.remove('show'); showToast('✅ 工作台数据已导出');
}
function exportCSV() {
  // 安全审计 2026-11-26（S-04）：CSV 注入。标题/分类/标签是用户输入：①引号没转义会跳出字段；②开头是 = + - @ 等会被 Excel 当公式执行。
  // 统一用 csvCell 包起来：引号双写，危险开头前加单引号变纯文本。
  const csvCell = v => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = ['标题名称', '所属分类', '标签', '链接数'];
  const rows = DB.items.map(it => [
    csvCell(it.title || ''),
    csvCell((DB.categories.find(c => c.id === it.categoryId) || {}).name || '无分类'),
    csvCell((it.tags || []).join(', ')),
    (it.links || []).length
  ]);
  downloadText('\uFEFF' + [head, ...rows].map(r => r.join(',')).join('\n'), `素材汇总报表_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  if(document.getElementById('export-modal')) document.getElementById('export-modal').classList.remove('show'); showToast('✅ CSV 报表已生成');
}
function downloadText(txt, fn, type) {
  const b = new Blob([txt], { type }); const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = fn; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

// 绑定全局键盘操作逻辑体系
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { 
    closeLightbox(); closeNineGridModal(); 
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openAddModal(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); scheduleSave(); showToast('手动保存触发成功','success'); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return; // 输入框内的 Ctrl+Z 交给浏览器原生文本撤销
    e.preventDefault(); performUndo();
  }
});

/* ═══════════════════════════════════════════════════════
   SIDEBAR TOGGLE (侧边栏收缩控制)
═══════════════════════════════════════════════════════ */
let sidebarCollapsed = false;
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  const sidebar = document.getElementById('sidebar');
  const icon = document.getElementById('sidebar-toggle-icon');
  if (sidebar) sidebar.classList.toggle('collapsed', sidebarCollapsed);
  if (icon) icon.className = sidebarCollapsed ? 'ti ti-layout-sidebar-right' : 'ti ti-layout-sidebar';
}

let detailCollapsed = false;
function toggleDetailSidebar() {
  detailCollapsed = !detailCollapsed;
  const detail = document.getElementById('detail');
  const icon = document.getElementById('detail-toggle-icon');
  if (detail) detail.classList.toggle('collapsed', detailCollapsed);
  if (icon) icon.className = detailCollapsed ? 'ti ti-layout-sidebar' : 'ti ti-layout-sidebar-right';
}

// 修复建议5：窄屏（如平板竖屏）自动收起两侧栏，避免主内容被挤压；只在首次跨过断点时自动收一次，不会打架用户之后的手动展开
let autoCollapseApplied = false;
function applyResponsiveLayout() {
  if (window.innerWidth < 860 && !autoCollapseApplied) {
    autoCollapseApplied = true;
    if (!sidebarCollapsed) toggleSidebar();
    if (!detailCollapsed) toggleDetailSidebar();
  }
}
window.addEventListener('resize', () => { clearTimeout(window._responsiveTimer); window._responsiveTimer = setTimeout(applyResponsiveLayout, 200); });
// 快捷键 [ 切换侧边栏
document.addEventListener('keydown', e => {
  if (e.key === '[' && !e.ctrlKey && !e.metaKey) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
    toggleSidebar();
  }
});

/* ═══════════════════════════════════════════════════════
   UPDATE CHECKER (版本更新检测系统)
═══════════════════════════════════════════════════════ */
// 🆕 v1.5-fix：更新检查节流与缓存（见 A-09）。自动检查 6 小时最多跑一次网络请求；
// 手动检查 10 秒内最多 1 次；403/429 进入退避，恢复前不再发请求。
// 🆕 v1.5-fix2：只提示正式版。/releases/latest 只返回最新正式版（不含 prerelease/draft）。
let _updateCheckCache = { at: 0, data: null };
let _updateBackoffUntil = 0;
let _lastManualUpdateCheckAt = 0;
let _pendingUpdateVersion = '';
const UPDATE_CHECK_CACHE_MS = 6 * 60 * 60 * 1000;
const UPDATE_MANUAL_MIN_INTERVAL_MS = 10 * 1000;
function _parseReleaseVersion(tag) {
  // 🆕 v1.5-fix：只取开头的数字段（如 1.5.1），不再把 1.5.1-beta2 误算成 1.5.12。
  const m = /^v?(\d+(?:\.\d+)*)/.exec(String(tag || '').trim());
  return m ? m[1] : '';
}
function _isNewerVersion(remote, local) {
  const r = String(remote).split('.').map(Number);
  const l = String(local).split('.').map(Number);
  const len = Math.max(r.length, l.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] || 0, lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}
function _maybeShowUpdate(data, isManual) {
  const latestVer = data.latestVer;
  if (!latestVer) { if (isManual) showToast('✅ 暂无发布版本，当前已是最新', 'success'); return; }
  const skipped = (DB.settings && DB.settings.skippedUpdateVersion) || '';
  if (latestVer === skipped) {
    if (isManual) showToast('已暂时忽略 v' + latestVer + '，下个版本发布时再提示', 'warning');
    return;
  }
  if (_isNewerVersion(latestVer, APP_VERSION)) {
    showUpdateModal(latestVer, data.notes, data.downloadUrl);
  } else if (isManual) {
    showToast('✅ 当前已是最新版本 v' + APP_VERSION, 'success');
  }
}
async function checkForUpdate(isManual = false) {
  if (!GITHUB_REPO) {
    if (isManual) showToast('⚙️ 当前版本暂不支持在线更新检测', 'warning');
    return;
  }
  if (!navigator.onLine) {
    if (isManual) showToast('📵 当前离线，无法检测更新', 'warning');
    return;
  }
  const now = Date.now();
  if (!isManual && _updateCheckCache.data && now - _updateCheckCache.at < UPDATE_CHECK_CACHE_MS) {
    _maybeShowUpdate(_updateCheckCache.data, false);
    return;
  }
  if (isManual) {
    if (now - _lastManualUpdateCheckAt < UPDATE_MANUAL_MIN_INTERVAL_MS) { showToast('操作频繁，请稍后再试', 'warning'); return; }
    _lastManualUpdateCheckAt = now;
  }
  if (now < _updateBackoffUntil) {
    if (isManual) showToast(`更新检查受限，请约 ${Math.ceil((_updateBackoffUntil - now) / 60000)} 分钟后再试`, 'warning');
    return;
  }

  try {
    // 只取最新正式版（此前拉全部 releases 列表，含测试版）。
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.status === 404) {
      if (isManual) showToast('✅ 暂无发布版本，当前已是最新', 'success');
      return;
    }
    if (res.status === 403 || res.status === 429) {
      let waitMs = 60 * 60 * 1000;
      try {
        const reset = res.headers.get('x-ratelimit-reset');
        if (reset) waitMs = Math.max(60000, Number(reset) * 1000 - Date.now());
        const ra = res.headers.get('retry-after');
        if (ra) waitMs = Math.max(waitMs, Number(ra) * 1000);
      } catch (e) {}
      _updateBackoffUntil = Date.now() + waitMs;
      if (isManual) showToast(`❌ 更新检查受限（HTTP ${res.status}），约 ${Math.ceil(waitMs / 60000)} 分钟后恢复`, 'error');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const rel = await res.json();
    const data0 = Array.isArray(rel) ? rel[0] : rel;
    if (!data0 || !data0.tag_name) {
      if (isManual) showToast('✅ 暂无发布版本，当前已是最新', 'success');
      return;
    }
    const latestVer = _parseReleaseVersion(data0.tag_name);
    const notes = (data0.body || '').trim() || '暂无更新说明。';
    // 资产优先找 .zip（仓库 workflow 实际发的就是 zip），再找 .html / 含“素材”的文件。
    const assets = data0.assets || [];
    const asset = assets.find(a => a.name.endsWith('.zip')) || assets.find(a => a.name.endsWith('.html') || a.name.includes('素材'));
    const downloadUrl = asset
      ? asset.browser_download_url
      : `https://github.com/${GITHUB_REPO}/releases/latest`;

    const data = { latestVer, notes, downloadUrl };
    _updateCheckCache = { at: Date.now(), data };
    _maybeShowUpdate(data, isManual);
  } catch (e) {
    if (isManual) showToast('❌ 检测失败：' + (e.message || '网络错误'), 'error');
  }
}

function showUpdateModal(newVer, notes, downloadUrl) {
  _pendingUpdateVersion = newVer;
  const el = id => document.getElementById(id);
  if (el('update-cur-ver')) el('update-cur-ver').textContent = APP_VERSION;
  if (el('update-new-ver')) el('update-new-ver').textContent = newVer;
  if (el('update-notes')) el('update-notes').textContent = notes;
  if (el('update-download-btn')) {
    el('update-download-btn').onclick = () => {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `素材参考库_v${newVer}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      el('update-modal').classList.remove('show');
      showToast('⬇️ 下载已开始，完成后替换旧文件即可', 'success');
    };
  }
  if (el('update-modal')) el('update-modal').classList.add('show');
}

/* ═══════════════════════════════════════════════════════
   SYSTEM BOOT (猎人系统总控启动点火程序)
═══════════════════════════════════════════════════════ */
async function bootSystem() {
  if ('showDirectoryPicker' in window) {
    const h = await FsStore.get('root_dir');
    if (h) {
      try {
        if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') { dirHandle = h; await setupWorkspace(); return; }
        else { 
            if(document.getElementById('folder-banner')) document.getElementById('folder-banner').classList.add('show'); 
            if(document.getElementById('btn-restore-folder')) document.getElementById('btn-restore-folder').style.display = 'flex'; 
            if(document.getElementById('btn-choose-folder')) document.getElementById('btn-choose-folder').style.display = 'none'; 
            if(document.getElementById('folder-banner-msg')) document.getElementById('folder-banner-msg').textContent = '已记住您的文件夹「' + h.name + '」，浏览器仅需重新授权一次（无需重新选择文件夹）。点击任意处或"恢复连接"即可。';
            // 浏览器出于安全考虑，每次重启后都需要重新确认硬盘授权，但文件夹本身已被记住，无需重新选择。
            // 这里监听页面上的第一次点击，借助该用户手势自动尝试恢复授权，减少手动点击"恢复连接"按钮的麻烦。
            const autoRestoreOnce = () => { document.removeEventListener('click', autoRestoreOnce, true); if (!dirHandle) restoreFolderAccess(); };
            document.addEventListener('click', autoRestoreOnce, true);
        }
      } catch (e) { if(document.getElementById('folder-banner')) document.getElementById('folder-banner').classList.add('show'); }
    } else { if(document.getElementById('folder-banner')) document.getElementById('folder-banner').classList.add('show'); }
  } else {
    if(document.getElementById('folder-banner')){
      document.getElementById('folder-banner').innerHTML = '<div class="folder-banner-text" style="color:var(--txdr)">提示：当前浏览器内核过旧，不支持直接访问本地硬盘，已自动切换为网页临时缓存模式。</div>';
      document.getElementById('folder-banner').classList.add('show');
    }
  }

  // Fallback 降级防御
  if (!dirHandle) {
    try {
      const localDB = localStorage.getItem('lhy_v1_db'); if (localDB) DB = Object.assign(DB, safeJsonParse(localDB));
      const localWS = localStorage.getItem('lhy_v1_ws'); if (localWS) WS = Object.assign(WS, safeJsonParse(localWS));
    } catch (e) { }
    
    // 数据缺省守护屏障补充
    if (!DB.accounts) DB.accounts = [];
    if (!DB.trash) DB.trash = [];
    if (!DB.recent) DB.recent = [];
    if (!WS.order) WS.order = ['scripts', 'tasks', 'notes', 'intakes', 'weekly'];
    if (!WS.collapsed) WS.collapsed = {};
    
    ensureDefaults(); applySettings();

    // 2026-11-26：PIN 锁屏功能已完整删除，直接进入大库界面。
    switchView('lib');
  }
}



// 🆕 v1.5-fix：“暂时忽略此版本”。把版本号记进设置，之后同一版本不再弹窗（见 A-09）。
function skipUpdateVersion() {
  ensureDefaults();
  if (_pendingUpdateVersion) {
    DB.settings.skippedUpdateVersion = _pendingUpdateVersion;
    scheduleSave();
    showToast('已忽略 v' + _pendingUpdateVersion + '，下个版本发布时再提示', 'success');
  }
  const m = document.getElementById('update-modal');
  if (m) m.classList.remove('show');
}

// 引擎点火！
bootSystem();
applyResponsiveLayout();
// 启动后延迟 3 秒静默检测版本更新
setTimeout(() => checkForUpdate(false), 3000);
