/* ==== AUTO-GENERATED EVENT-HANDLER WRAPPERS (CSP-compliant, replaces inline on* attributes) ==== */
// 2026-11-26：PIN 锁屏功能已完整删除，__h1（锁屏输入处理）一并删除。
function __h2(event, ) { toggleSidebar() }
function __h3(event, ) { checkForUpdate(true) }
function __h4(event, ) { toggleDetailSidebar() }
function __h5(event, ) { openSettings() }
function __h6(event, ) { switchView('lib') }
function __h8(event, ) { openAddCategoryModal() }
function __h9(event, ) { switchView('trash') }
function __h10(event, ) { chooseFolder() }
function __h11(event, ) { restoreFolderAccess() }
function __h12(event, ) { chooseFolder() }
function __h13(event, ) { toggleSortDropdown(event) }
function __h14(event, ) { applySortMode('name-asc') }
function __h15(event, ) { applySortMode('name-desc') }
function __h16(event, ) { applySortMode('count-desc') }
function __h17(event, ) { applySortMode('count-asc') }
function __h18(event, ) { applySortMode('created-desc') }
function __h19(event, ) { applySortMode('created-asc') }
function __h20(event, ) { applySortMode('recent') }
function __h21(event, ) { if(!event.target.closest('.card')) { event.preventDefault(); showContextMenu(event, 'ctx-grid'); } }
function __h22(event, ) { openAddModal() }
function __h23(event, ) { openAddCategoryModal() }
function __h24(event, ) { chooseFolder() }
function __h25(event, ) { restoreFolderAccess() }
function __h26(event, ) { openNineGridModal(selectedId) }
function __h27(event, ) { copyAllLinks() }
function __h28(event, ) { addLinkFromInput() }
function __h31(event, ) { openNineGridModal(selectedId) }
function __h32(event, ) { openNineGridModal(selectedId) }
function __h33(event, ) { uploadShots() }
function __h34(event, ) { openEditModal() }
function __h35(event, ) { deleteCurrentItem() }
function __h36(event, ) { toggleTrashSelectAll() }
function __h37(event, ) { restoreSelectedTrash() }
function __h38(event, ) { permanentDeleteSelectedTrash() }
function __h39(event, ) { if(event.target===this) closeNineGridModal(); }
function __h40(event, ) { closeNineGridModal() }
function __h41(event, ) { toggleNineSelectAll() }
function __h42(event, ) { exportNineGridSelected() }
function __h43(event, ) { toggleNineViewMode() }
function __h44(event, ) { updateSetting('nineCols', this.value); renderNineGrid(); }
function __h45(event, ) { updateSetting('nineRatio', this.value); renderNineGrid(); }
function __h50(event, ) { closeLightbox() }
function __h51(event, ) { navGallery(-1,event) }
function __h52(event, ) { event.stopPropagation() }
function __h53(event, ) { navGallery(1,event) }
function __h54(event, ) { closeItemModal() }
function __h55(event, ) { toggleCategoryDropdown() }
function __h56(event, ) { document.getElementById('tag-text-input').focus() }
function __h57(event, ) { closeItemModal() }
function __h58(event, ) { saveItemModal() }
function __h59(event, ) { document.getElementById('cat-modal').classList.remove('show') }
function __h60(event, ) { if(event.key==='Enter')saveCatModal() }
function __h61(event, ) { document.getElementById('cat-modal').classList.remove('show') }
function __h62(event, ) { saveCatModal() }
function __h63(event, ) { closeSettings() }
function __h64(event, ) { updateSetting('theme', this.value); setTheme(this.value); }
function __h68(event, ) { chooseFolder() }
function __h69(event, ) { closeSettings();openImport() }
function __h70(event, ) { closeSettings();openExport() }
function __h71(event, ) { closeSettings() }
function __h72(event, ) { document.getElementById('export-modal').classList.remove('show') }
function __h73(event, ) { exportJSON() }
function __h74(event, ) { exportWSJSON() }
function __h75(event, ) { exportCSV() }
function __h76(event, ) { document.getElementById('import-modal').classList.remove('show') }
function __h77(event, ) { triggerImportJSON() }
function __h78(event, ) { triggerImportWSJSON() }
function __h79(event, ) { handleImportJSON(event) }
function __h80(event, ) { handleImportWSJSON(event) }
function __h81(event, ) { ctxRename() }
function __h82(event, ) { ctxDelete() }
function __h83(event, ) { cardCtxEdit() }
function __h84(event, ) { openAddModal() }
function __h85(event, ) { openAddCategoryModal() }
function __h86(event, ) { deleteCurrentItem(true) }
function __h87(event, ) { handleCardImgCtx('save') }
function __h88(event, ) { handleCardImgCtx('copy') }
function __h90(event, ) { handleCardImgCtx('delete') }
function __h91(event, ) { openAddCategoryModal() }
function __h92(event, ) { openAddModal() }
function __h93(event, ) { handleNineCtx('save') }
function __h94(event, ) { handleNineCtx('copy') }
function __h95(event, ) { handleNineCtx('pin') }
function __h97(event, ) { handleNineCtx('delete') }
function __h98(event, ) { document.getElementById('update-modal').classList.remove('show') }
function __h99(event, ) { document.getElementById('update-modal').classList.remove('show') }
function __h100(event, ) { handleShotUpload(event) }
function __h101(event, __P0__) { filterByCategory(__P0__, this) }
function __h102(event, __P0__) { showContextMenu(event, 'ctx-cat', __P0__) }
function __h103(event, __P0__) { handleCardClick(__P0__, event) }
function __h104(event, __P0__) { openNineGridModal(__P0__) }
function __h105(event, __P0__) { showContextMenu(event, 'ctx-card', __P0__) }
function __h106(event, __P0__) { libCardDragStart(__P0__, event) }
function __h107(event, ) { libCardDragEnd(event) }
function __h108(event, ) { libCardDragOver(event) }
function __h109(event, __P0__) { libCardDrop(__P0__, event) }
function __h110(event, ) { this.style.display='none';this.nextElementSibling.style.display='flex'; }
function __h111(event, __P0__) { copySingleLink(__P0__) }
function __h112(event, __P0__) { openExternalLink(__P0__) }
function __h113(event, __P0__) { removeLink(__P0__) }
function __h114(event, __P0__) { openExternalLink(__P0__) }
function __h115(event, __P0__, __P1__) { openGallery(__P0__, __P1__) }
function __h116(event, __P0__) { event.stopPropagation();pinShot(__P0__) }
function __h117(event, __P0__) { event.stopPropagation();deleteShot(__P0__) }
function __h118(event, __P0__) { toggleTrashSelect(__P0__) }
function __h119(event, __P0__) { event.stopPropagation(); toggleTrashSelect(__P0__) }
function __h120(event, ) { closeNineGridModal(); uploadShots(); }
function __h121(event, __P0__) { handleNineItemClick(__P0__, event) }
function __h122(event, __P0__) { nineDragStart(__P0__, event) }
function __h123(event, ) { nineDragEnd(event) }
function __h124(event, ) { nineDragOver(event) }
function __h125(event, __P0__) { nineDrop(__P0__, event) }
function __h126(event, __P0__) { nineCtxCurrentIdx=__P0__; showContextMenu(event, 'ctx-nine'); }
function __h127(event, ) { event.stopPropagation(); } // 🆕 v1.4：放大镜还原，靠 stopPropagation 避免触发父层选中逻辑（这样它自己的 click 不会被中途重渲染打断）
function __h128(event, __P0__, __P1__) { event.stopPropagation(); openGallery(__P0__, __P1__) }
function __h129(event, __P0__, __P1__) { openGallery(__P0__, __P1__) }
function __h130(event, __P0__) { event.stopPropagation(); galleryIndex = __P0__; renderLightbox(); }
function __h131(event, __P0__) { formTags.splice(__P0__,1); renderFormTags() }
function __h132(event, __P0__) { selectCategoryOption(__P0__) }
function __h133(event, __P0__, __P1__) { event.stopPropagation(); openGallery(__P0__, __P1__) } // 🆕 v1.4：画廊缩略图双击直接看大图（此前误用了已被占用的 __h131 编号，与"删除标签"按钮冲突，这里改用未占用的新编号）
function __h134(event, __P0__) { pickTagSuggestion(__P0__) } // 🆕 v1.4：点击标签推荐项直接添加该标签
function __h135(event, ) { openMergeModal() } // 🆕 2026-11-26：批量操作条——合并（“移动到分类”已去掉）
function __h136(event, ) { openBatchDeleteModal() } // 🆕 v1.4：批量操作条——批量移入回收站（2026-11-26 改：先弹确认框，点确定删除才移，不用输“删除”）
function __h137(event, ) { clearLibBatchSelection() } // 🆕 v1.4：批量操作条——取消选择
function __h140(event, ) { toggleTrashAutoClean() } // 🆕 v1.4：回收站自动清理总开关
function __h141(event, ) { setTrashCleanDays(this.value) } // 🆕 v1.4：回收站自动清理——保留天数
function __h142(event, ) { setTrashCleanSize(this.value) } // 🆕 v1.4：回收站自动清理——体积上限
function __h143(event, ) { toggleThumbEnabled() } // 🆕 v1.5：缩略图总开关
function __h144(event, ) { setThumbQuality(this.value) } // 🆕 v1.5：缩略图质量
function __h145(event, ) { skipUpdateVersion() } // 🆕 v1.5-fix：更新弹窗“暂时忽略此版本”
function __h146(event) { // 搜索框一键清空
  event.preventDefault();
  event.stopPropagation();
  const inp = document.getElementById('search');
  if (inp) { inp.value = ''; inp.focus(); }
  if (typeof updateSearchClearBtn === 'function') updateSearchClearBtn();
  if (typeof renderLibraryGrid === 'function') renderLibraryGrid();
}
function __h147(event, ) { confirmMergeSelected() } // 🆕 2026-11-26：批量合并——确认合并
function __h148(event, ) { closeMergeModal() } // 🆕 2026-11-26：批量合并——关闭弹窗
function __h149(event, ) { if(event.key==='Enter')confirmMergeSelected() } // 🆕 2026-11-26：批量合并——输入框回车确认
function __h150(event, ) { switchSettingsTab(this.dataset.tab) } // 🆕 2026-11-26：设置左侧导航——点导航换一页
function __h151(event, ) { setThemeModeSeg(this.dataset.mode) } // 🆕 2026-11-26：设置里主题分段选择
function __h152(event, ) { checkForUpdate(true) } // 🆕 2026-11-26：设置关于页——手动检查更新
function __h153(event, ) { confirmBatchDeleteModal() } // 🆕 2026-11-26：批量删除确认框——确定删除
function __h154(event, ) { cancelBatchDeleteModal() } // 🆕 2026-11-26：批量删除确认框——取消
function __h155(event, ) { enableThumbsFromSuggest() } // 🆕 2026-11-26：超 1GB 弹窗——打开缩略图
function __h156(event, ) { dismissThumbSuggest() } // 🆕 2026-11-26：超 1GB 弹窗——不再提醒（以后不再问）
function __h157(event, ) { remindThumbSuggestLater() } // 🆕 2026-11-26：超 1GB 弹窗——下次再提醒（只关这次）

window.__Handlers = {
  __h2: __h2,
  __h3: __h3,
  __h4: __h4,
  __h5: __h5,
  __h6: __h6,
  __h8: __h8,
  __h9: __h9,
  __h10: __h10,
  __h11: __h11,
  __h12: __h12,
  __h13: __h13,
  __h14: __h14,
  __h15: __h15,
  __h16: __h16,
  __h17: __h17,
  __h18: __h18,
  __h19: __h19,
  __h20: __h20,
  __h21: __h21,
  __h22: __h22,
  __h23: __h23,
  __h24: __h24,
  __h25: __h25,
  __h26: __h26,
  __h27: __h27,
  __h28: __h28,
  __h31: __h31,
  __h32: __h32,
  __h33: __h33,
  __h34: __h34,
  __h35: __h35,
  __h36: __h36,
  __h37: __h37,
  __h38: __h38,
  __h39: __h39,
  __h40: __h40,
  __h41: __h41,
  __h42: __h42,
  __h43: __h43,
  __h44: __h44,
  __h45: __h45,
  __h50: __h50,
  __h51: __h51,
  __h52: __h52,
  __h53: __h53,
  __h54: __h54,
  __h55: __h55,
  __h56: __h56,
  __h57: __h57,
  __h58: __h58,
  __h59: __h59,
  __h60: __h60,
  __h61: __h61,
  __h62: __h62,
  __h63: __h63,
  __h64: __h64,
  __h68: __h68,
  __h69: __h69,
  __h70: __h70,
  __h71: __h71,
  __h72: __h72,
  __h73: __h73,
  __h74: __h74,
  __h75: __h75,
  __h76: __h76,
  __h77: __h77,
  __h78: __h78,
  __h79: __h79,
  __h80: __h80,
  __h81: __h81,
  __h82: __h82,
  __h83: __h83,
  __h84: __h84,
  __h85: __h85,
  __h86: __h86,
  __h87: __h87,
  __h88: __h88,
  __h90: __h90,
  __h91: __h91,
  __h92: __h92,
  __h93: __h93,
  __h94: __h94,
  __h95: __h95,
  __h97: __h97,
  __h98: __h98,
  __h99: __h99,
  __h100: __h100,
  __h101: __h101,
  __h102: __h102,
  __h103: __h103,
  __h104: __h104,
  __h105: __h105,
  __h106: __h106,
  __h107: __h107,
  __h108: __h108,
  __h109: __h109,
  __h110: __h110,
  __h111: __h111,
  __h112: __h112,
  __h113: __h113,
  __h114: __h114,
  __h115: __h115,
  __h116: __h116,
  __h117: __h117,
  __h118: __h118,
  __h119: __h119,
  __h120: __h120,
  __h121: __h121,
  __h122: __h122,
  __h123: __h123,
  __h124: __h124,
  __h125: __h125,
  __h126: __h126,
  __h127: __h127,
  __h128: __h128,
  __h129: __h129,
  __h130: __h130,
  __h131: __h131,
  __h132: __h132,
  __h133: __h133,
  __h134: __h134,
  __h135: __h135,
  __h136: __h136,
  __h137: __h137,
  __h140: __h140,
  __h141: __h141,
  __h142: __h142,
  __h143: __h143,
  __h144: __h144,
  __h145: __h145,
  __h146: __h146,
  __h147: __h147,
  __h148: __h148,
  __h149: __h149,
  __h150: __h150,
  __h151: __h151,
  __h152: __h152,
  __h153: __h153,
  __h154: __h154,
  __h155: __h155,
  __h156: __h156,
  __h157: __h157,

  h_exportWholeItem: function (event) { const it = DB.items.find(i => i.id === ctxCardId); if (it) exportWholeItem(it); }, // 🆕 v1.3：主页卡片右键"打包导出整个素材"
  h_searchInput: function (event) { if (typeof scheduleLibrarySearchRender === 'function') scheduleLibrarySearchRender(); if (typeof updateSearchClearBtn === 'function') updateSearchClearBtn(); }, // 🆕 v1.5-fix：搜索防抖 180ms，不再每按一键就全量重渲染（见 A-05）
  h_searchFocus: function (event) { renderSearchHistoryDropdown(); }, // 🆕 v1.5：补全一直缺失的最近搜索记录功能（HTML/CSS 早就有了，唯独这几个处理函数一直没写）
  h_searchBlur: function (event) {
    const v = this.value.trim();
    if (v && typeof recordSearchHistory === 'function') recordSearchHistory(v);
    setTimeout(() => { const box = document.getElementById('search-history'); if (box) box.classList.remove('show'); }, 150); // 延迟一下，让点历史记录项的 click 先被处理到，不然 blur 会抢先把下拉框关掉
  },
  h_pickSearchHistory: function (event, term) { pickSearchHistory(term); },
  h_cancelConfirmDelete: function (event) { cancelConfirmDeleteModal(); }, // 🆕 v1.3：永久删除确认弹窗-取消
  h_confirmConfirmDelete: function (event) { confirmConfirmDeleteModal(); }, // 🆕 v1.3：永久删除确认弹窗-确定
  h_refreshDiskUsage: function (event) { computeAndRenderDiskUsage(true); }, // 🆕 v1.5-fix：手动刷新绕过 5 分钟统计缓存（见 A-08）
};
