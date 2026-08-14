/**
 * prompt-polish client half — 浏览器 bundle（window.__ModuleLoader__.load 格式）。
 *
 * - 「✨ 润色」按钮   → conversation.input.left（输入框工具行）
 * - 优化面板          → conversation.input.dock（输入框上方）
 * - 「📋 日志」按钮   → sidebar.footer.action（侧边栏底部）
 * - 日志浮层          → shell.overlay（右上角浮动面板）
 * - host 通信         → 同源 fetch：POST /pp-api/polish、GET /pp-api/logs
 */
window.__ModuleLoader__.load({
  id: 'prompt-polish',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')

    var CSS_TEXT = [
      '.pp-trigger{padding:2px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6;cursor:pointer;white-space:nowrap}',
      '.pp-trigger:hover:not(:disabled){color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.pp-trigger:disabled{opacity:0.45;cursor:default}',
      '.pp-panel{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.pp-head{display:flex;align-items:center;gap:8px}',
      '.pp-title{font-size:13px;font-weight:600}',
      '.pp-busy{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.pp-applied{font-size:12px;color:var(--dsw-alias-state-success-primary)}',
      '.pp-err{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.pp-chips{display:flex;gap:6px;flex-wrap:wrap}',
      '.pp-chip{padding:1px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}',
      '.pp-chip:hover{color:var(--dsw-alias-label-primary)}',
      '.pp-chip.active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.pp-box{width:100%;min-height:64px;max-height:200px;resize:vertical;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:8px;font:inherit;font-size:13px;line-height:1.5;box-sizing:border-box}',
      '.pp-box:focus{outline:1px solid var(--dsw-alias-brand-primary)}',
      '.pp-actions{display:flex;gap:6px;flex-wrap:wrap}',
      '.pp-btn{padding:3px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}',
      '.pp-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.pp-btn:disabled{opacity:0.5;cursor:default}',
      '.pp-btn.primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.pp-tip{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.pp-logbtn{padding:2px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6;cursor:pointer;white-space:nowrap}',
      '.pp-logbtn:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.pp-logbtn.active{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.pp-logpanel{position:fixed;top:12px;right:12px;width:min(560px,92vw);max-height:80vh;display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 8px 30px rgba(0,0,0,.25);pointer-events:auto}',
      '.pp-loghead{display:flex;align-items:center;gap:6px}',
      '.pp-logtitle{font-size:13px;font-weight:600;flex:1}',
      '.pp-loglist{overflow:auto;display:flex;flex-direction:column;gap:2px;font-size:12px;line-height:1.5}',
      '.pp-logrow{display:flex;gap:6px;align-items:baseline;border-bottom:1px solid var(--dsw-alias-border-l1);padding:2px 0}',
      '.pp-logrow.error{color:var(--dsw-alias-state-error-primary)}',
      '.pp-logrow.warn{color:var(--dsw-alias-state-warn-primary)}',
      '.pp-logtime{color:var(--dsw-alias-label-secondary);flex:none;font-variant-numeric:tabular-nums}',
      '.pp-logsrc{flex:none;color:var(--dsw-alias-label-secondary)}',
      '.pp-logmsg{flex:1;word-break:break-all}',
      '.pp-logdetail{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all;white-space:pre-wrap}',
      '.pp-health{display:flex;flex-direction:column;gap:2px;font-size:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2)}',
      '.pp-hrow.err{color:var(--dsw-alias-state-error-primary)}',
      '.pp-logempty{color:var(--dsw-alias-label-secondary);font-size:12px;padding:8px}'
    ].join('\n')

    /* ── client 日志 ─────────────────────────────────────────────── */
    var MAX_CLIENT_LOGS = 300
    var clientLogs = []
    var logSeq = 0
    function clog(level, msg, detail) {
      clientLogs.push({ seq: logSeq++, t: Date.now(), level: level, src: 'client', msg: msg, detail: detail || null })
      if (clientLogs.length > MAX_CLIENT_LOGS) clientLogs.splice(0, clientLogs.length - MAX_CLIENT_LOGS)
    }
    function fmtTime(t) {
      var d = new Date(t)
      function pad(n, w) {
        var s = String(n)
        while (s.length < w) s = '0' + s
        return s
      }
      return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' + pad(d.getMilliseconds(), 3)
    }
    async function fetchJson(url, options, timeoutMs) {
      var ctrl = new AbortController()
      var timer = setTimeout(function () { ctrl.abort() }, timeoutMs || 60000)
      try {
        return await fetch(url, Object.assign({}, options, { signal: ctrl.signal }))
      } finally {
        clearTimeout(timer)
      }
    }

    /* ── 共享 store ──────────────────────────────────────────────── */
    var store = { open: false, busy: false, error: null, history: [], index: 0, currentEdit: '', applied: false, logOpen: false, hostLogs: [], hostHealth: null, logLoading: false, logError: null }
    var version = 0
    var listeners = new Set()

    function emit() {
      version += 1
      listeners.forEach(function (fn) { fn() })
    }
    function subscribe(fn) {
      listeners.add(fn)
      return function () { listeners.delete(fn) }
    }
    function useStoreVersion() {
      var state = React.useState(0)
      React.useEffect(function () {
        return subscribe(function () { state[1](function (v) { return v + 1 }) })
      }, [])
    }

    /* ── host 日志拉取 ───────────────────────────────────────────── */
    async function refreshHostLogs() {
      store.logLoading = true
      store.logError = null
      emit()
      try {
        var res = await fetchJson('/pp-api/logs', { method: 'GET' }, 10000)
        var payload = null
        try { payload = await res.json() } catch (e) { payload = null }
        if (!res.ok || !payload) throw new Error((payload && payload.error) ? payload.error : ('HTTP ' + res.status))
        store.hostLogs = Array.isArray(payload.logs) ? payload.logs : []
        store.hostHealth = payload.health || null
        clog('info', 'host 日志拉取成功: ' + store.hostLogs.length + ' 条')
      } catch (err) {
        store.logError = (err && err.message) ? err.message : String(err)
        clog('error', 'host 日志拉取失败: ' + store.logError)
      }
      store.logLoading = false
      emit()
    }

    /* ── 润色流程 ────────────────────────────────────────────────── */
    async function runPolish(baseText, rounds, instruction, mode, applyDraft) {
      if (store.busy) return
      store.open = true
      store.busy = true
      store.error = null
      store.applied = false
      emit()
      var started = Date.now()
      clog('info', (mode === 'session' ? '开始润色（新会话）' : '开始重写/多轮') + ': textLen=' + baseText.length + ' rounds=' + rounds)
      try {
        var res = await fetchJson('/pp-api/polish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: baseText, rounds: rounds, instruction: instruction })
        }, 150000)
        var payload = null
        try { payload = await res.json() } catch (e) { payload = null }
        if (!res.ok || !payload || !Array.isArray(payload.versions)) {
          throw new Error((payload && payload.error) ? payload.error : ('HTTP ' + res.status))
        }
        var versions = payload.versions
        if (versions.length === 0) throw new Error('未收到优化结果')
        if (mode === 'session') {
          store.history = [{ text: baseText, label: '原文' }]
          store.index = 0
        }
        for (var i = 0; i < versions.length; i += 1) {
          store.history.push({ text: versions[i], label: 'v' + store.history.length })
          store.index = store.history.length - 1
        }
        if (store.history.length > 31) {
          var excess = store.history.length - 31
          store.history.splice(1, excess)
          store.index = Math.max(0, store.index - excess)
        }
        store.currentEdit = store.history[store.index].text
        clog('info', '润色成功: ' + versions.length + ' 版, 耗时 ' + (Date.now() - started) + 'ms, 当前版本长度=' + store.currentEdit.length)
        if (typeof applyDraft === 'function') {
          try {
            applyDraft(store.currentEdit)
            store.applied = true
            clog('info', '已自动写入输入框: 长度=' + store.currentEdit.length)
          } catch (err) {
            clog('warn', '自动写入输入框失败: ' + ((err && err.message) ? err.message : String(err)))
          }
        }
      } catch (err) {
        store.error = (err && err.message) ? err.message : String(err)
        clog('error', '润色失败 (' + (Date.now() - started) + 'ms): ' + store.error)
      }
      store.busy = false
      emit()
    }

    function undo() {
      if (store.busy || store.index <= 0) return
      store.index -= 1
      store.currentEdit = store.history[store.index].text
      clog('info', '撤回 → ' + store.history[store.index].label)
      emit()
    }
    function jump(i) {
      if (store.busy || i < 0 || i >= store.history.length) return
      store.index = i
      store.currentEdit = store.history[i].text
      clog('info', '跳回版本 ' + store.history[i].label)
      emit()
    }
    function closePanel() {
      store.busy = false
      store.open = false
      clog('info', '优化面板关闭')
      emit()
    }

    /* ── 组件 ────────────────────────────────────────────────────── */
    var lastTriggerDiag = null
    function TriggerView(props) {
      useStoreVersion()
      var hasUseInput = typeof props.useInput === 'function'
      var hasActions = !!props.inputActions
      var ownerInput = props.input
      var hookInput = hasUseInput ? props.useInput(function (s) { return s }) : null
      var draft = (ownerInput && typeof ownerInput.draft === 'string') ? ownerInput.draft
        : (hookInput && typeof hookInput.draft === 'string') ? hookInput.draft : ''
      var canStart = !store.busy && draft.trim().length > 0
      var diag = 'ownerInput=' + (ownerInput ? 'yes' : 'no') + ' useInput=' + (hasUseInput ? 'yes' : 'no') + ' actions=' + (hasActions ? 'yes' : 'no') + ' draftLen=' + draft.length + ' canStart=' + canStart + ' busy=' + store.busy
      if (diag !== lastTriggerDiag) {
        lastTriggerDiag = diag
        clog('debug', 'Trigger 渲染诊断: ' + diag)
      }
      var onClick = function () {
        if (!canStart) {
          clog('warn', '润色按钮被点击但处于禁用状态: ' + diag)
          return
        }
        clog('info', '润色按钮点击: draft=' + draft.slice(0, 40) + (draft.length > 40 ? '…' : ''))
        runPolish(draft.trim(), 1, '', 'session', function (text) { props.inputActions.setDraft(text) })
      }
      return React.createElement('button', { className: 'pp-trigger', onClick: onClick, disabled: !canStart, title: canStart ? '调用提示词优化 agent 润色当前草稿（支持重写、多轮改写、撤回）' : '请先在输入框输入内容' }, '✨ 润色')
    }

    function PanelView(props) {
      useStoreVersion()
      if (!store.open) return null
      var current = store.history[store.index]
      if (!current) {
        return React.createElement('div', { className: 'pp-panel' }, React.createElement('div', { className: 'pp-err' }, '面板状态异常：history 为空。请点击「✨ 润色」重新开始。'))
      }
      var chips = []
      for (var i = 0; i < store.history.length; i += 1) {
        chips.push(React.createElement('span', { key: 'chip-' + i, className: 'pp-chip' + (i === store.index ? ' active' : ''), onClick: (function (idx) { return function () { jump(idx) } })(i) }, store.history[i].label))
      }
      var canUndo = !store.busy && store.index > 0
      var canRun = !store.busy && current.text.trim().length > 0
      var status = store.busy ? React.createElement('span', { className: 'pp-busy' }, '⏳ 优化中…') : null
      var applied = (!store.busy && store.applied) ? React.createElement('span', { className: 'pp-applied' }, '✓ 已写入输入框，可继续重写 / 撤回调整') : null
      var err = store.error ? React.createElement('div', { className: 'pp-err' }, '⚠ ' + store.error) : null
      var applyText = function (send) {
        var text = store.currentEdit
        if (!text.trim() || store.busy) return
        props.inputActions.setDraft(text)
        store.applied = true
        clog('info', (send ? '应用并发送' : '应用到输入框') + ': 长度=' + text.length)
        if (send) {
          props.inputActions.submit()
          closePanel()
        }
      }
      var openLogs = function () {
        store.logOpen = true
        clog('info', '从优化面板打开日志')
        refreshHostLogs()
        emit()
      }
      return React.createElement('div', { className: 'pp-panel' },
        React.createElement('div', { className: 'pp-head' },
          React.createElement('span', { className: 'pp-title' }, '✨ 提示词优化'),
          status,
          applied,
          React.createElement('button', { className: 'pp-btn', onClick: openLogs, title: '打开插件日志面板' }, '📋 日志')
        ),
        err,
        React.createElement('div', { className: 'pp-chips' }, chips),
        React.createElement('textarea', { className: 'pp-box', value: store.currentEdit, disabled: store.busy, spellCheck: false, onChange: function (e) { store.currentEdit = e.target.value; store.applied = false; emit() } }),
        React.createElement('div', { className: 'pp-actions' },
          React.createElement('button', { className: 'pp-btn', onClick: undo, disabled: !canUndo }, '↩ 撤回'),
          React.createElement('button', { className: 'pp-btn', onClick: function () { runPolish(current.text, 1, '', 'continue', function (text) { props.inputActions.setDraft(text) }) }, disabled: !canRun }, '🔄 重写'),
          React.createElement('button', { className: 'pp-btn', onClick: function () { runPolish(current.text, 3, '', 'continue', function (text) { props.inputActions.setDraft(text) }) }, disabled: !canRun }, '⏩ 多轮改写 ×3'),
          React.createElement('button', { className: 'pp-btn primary', onClick: function () { applyText(false) }, disabled: store.busy }, '✓ 应用到输入框'),
          React.createElement('button', { className: 'pp-btn primary', onClick: function () { applyText(true) }, disabled: store.busy }, '✈ 应用并发送'),
          React.createElement('button', { className: 'pp-btn', onClick: closePanel, disabled: store.busy }, '✕ 关闭')
        ),
        React.createElement('div', { className: 'pp-tip' }, '润色结果已自动写入输入框；点击版本标签可跳回任意历史版本，「撤回」逐步回退上一版本。')
      )
    }

    function LogButtonView(props) {
      useStoreVersion()
      var wide = !!props.wide
      var onClick = function () {
        store.logOpen = !store.logOpen
        clog('info', '日志面板 ' + (store.logOpen ? '打开' : '关闭'))
        if (store.logOpen) refreshHostLogs()
        emit()
      }
      return React.createElement('button', { className: 'pp-logbtn' + (store.logOpen ? ' active' : ''), onClick: onClick, title: '提示词优化插件日志（含 host/client 诊断）' }, wide ? '📋 日志' : '📋')
    }

    function LogPanelView(props) {
      useStoreVersion()
      if (!store.logOpen) return null
      var merged = []
      var i
      for (i = 0; i < store.hostLogs.length; i += 1) merged.push(store.hostLogs[i])
      for (i = 0; i < clientLogs.length; i += 1) merged.push(clientLogs[i])
      merged.sort(function (a, b) { return b.t - a.t })
      var rows = []
      var max = Math.min(merged.length, 300)
      for (i = 0; i < max; i += 1) {
        var e = merged[i]
        rows.push(React.createElement('div', { key: 'log-' + i, className: 'pp-logrow ' + e.level },
          React.createElement('span', { className: 'pp-logtime' }, fmtTime(e.t)),
          React.createElement('span', { className: 'pp-logsrc' }, e.src),
          React.createElement('span', { className: 'pp-logmsg' }, e.msg),
          e.detail ? React.createElement('div', { className: 'pp-logdetail' }, e.detail) : null
        ))
      }
      var healthRows = []
      var health = store.hostHealth
      if (health) {
        healthRows.push(React.createElement('div', { className: 'pp-hrow' }, '接口状态: ' + (health.ok ? '✅ 正常' : '❌ 异常') + ' | 成功 ' + health.polishOk + ' / 失败 ' + health.polishFail + (health.lastOkMs != null ? ' | 最近耗时 ' + health.lastOkMs + 'ms' : '')))
        if (health.defaultModel) {
          healthRows.push(React.createElement('div', { className: 'pp-hrow' }, '默认模型: ' + (health.defaultModel.provider || '?') + ' / ' + (health.defaultModel.model || '?') + (health.defaultModel.error ? ' (' + health.defaultModel.error + ')' : '')))
        }
        if (health.llmProviders && health.llmProviders.length) {
          healthRows.push(React.createElement('div', { className: 'pp-hrow' }, 'LLM providers: ' + health.llmProviders.join(', ')))
        }
        if (health.lastError) {
          healthRows.push(React.createElement('div', { className: 'pp-hrow err' }, '最近错误: ' + health.lastError))
        }
      }
      var head = React.createElement('div', { className: 'pp-loghead' },
        React.createElement('span', { className: 'pp-logtitle' }, '📋 插件日志'),
        React.createElement('button', { className: 'pp-btn', onClick: refreshHostLogs, disabled: store.logLoading }, store.logLoading ? '拉取中…' : '🔄 刷新'),
        React.createElement('button', { className: 'pp-btn', onClick: function () { clientLogs.length = 0; clog('info', 'client 日志已清空'); emit() } }, '🗑 清空'),
        React.createElement('button', { className: 'pp-btn', onClick: function () { store.logOpen = false; emit() } }, '✕')
      )
      return React.createElement('div', { className: 'pp-logpanel' },
        head,
        store.logError ? React.createElement('div', { className: 'pp-err' }, '⚠ ' + store.logError) : null,
        healthRows.length ? React.createElement('div', { className: 'pp-health' }, healthRows) : null,
        rows.length ? React.createElement('div', { className: 'pp-loglist' }, rows) : React.createElement('div', { className: 'pp-logempty' }, '（暂无日志，点击「🔄 刷新」拉取 host 日志）')
      )
    }

    /* ── 插件入口 ────────────────────────────────────────────────── */
    var inject = ['slots']

    function apply(ctx) {
      clog('info', 'client bundle 启动（apply）')
      ctx.effect(function () {
        var tag = document.createElement('style')
        tag.dataset.plugin = 'prompt-polish'
        tag.textContent = CSS_TEXT
        document.head.appendChild(tag)
        return function () { tag.remove() }
      })

      var slots = ctx.slots
      slots.inject('conversation.input.left', function () {
        clog('info', 'slots 注入: conversation.input.left')
        return slots.register({ name: 'conversation.input.left', id: 'prompt-polish.trigger', order: 25, label: '润色' }, function (props) {
          return React.createElement(TriggerView, props)
        })
      })
      slots.inject('conversation.input.dock', function () {
        clog('info', 'slots 注入: conversation.input.dock')
        return slots.register({ name: 'conversation.input.dock', id: 'prompt-polish.panel', order: 15, label: '提示词优化' }, function (props) {
          return React.createElement(PanelView, props)
        })
      })
      slots.inject('sidebar.footer.action', function () {
        clog('info', 'slots 注入: sidebar.footer.action')
        return slots.register({ name: 'sidebar.footer.action', id: 'prompt-polish.logs', order: 30, label: '日志' }, function (props) {
          return React.createElement(LogButtonView, props)
        })
      })
      slots.inject('shell.overlay', function () {
        clog('info', 'slots 注入: shell.overlay')
        return slots.register({ name: 'shell.overlay', id: 'prompt-polish.logpanel', order: 40 }, function (props) {
          return React.createElement(LogPanelView, props)
        })
      })
      clog('info', 'client bundle 初始化完成')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
