/**
 * prompt-polish host half — 提示词优化助手（静态插件，随 harness 启动自动加载）。
 *
 * - POST /pp-api/polish   : 调用「提示词工程专家」agent 润色命令（支持多轮迭代）
 * - GET  /pp-api/logs     : 返回内存日志缓冲 + 运行健康诊断（供侧边栏日志面板拉取）
 * - GET  /pp-api/config   : 返回当前自定义 API 配置（apiKey 脱敏）
 * - POST /pp-api/config   : 保存自定义 API 配置
 */
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

module.exports = {
  inject: ['llm', 'timer', 'webServer'],

  apply(ctx) {
    let seq = 0
    const MAX_LOGS = 500
    const hostLogs = []
    const stats = { startedAt: Date.now(), polishOk: 0, polishFail: 0, lastError: null, lastOkMs: null }

    /* ── 自定义 API 配置读写 ─────────────────────────────────────── */
    const configDir = path.join(os.homedir(), '.dsh', 'plugins')
    const configPath = path.join(configDir, 'prompt-polish.json')

    function loadConfig() {
      try {
        const raw = fs.readFileSync(configPath, 'utf8')
        const cfg = JSON.parse(raw)
        return {
          customApi: {
            enabled: !!(cfg.customApi && cfg.customApi.enabled),
            baseUrl: (cfg.customApi && cfg.customApi.baseUrl) || 'https://api.openai.com/v1',
            apiKey: (cfg.customApi && cfg.customApi.apiKey) || '',
            model: (cfg.customApi && cfg.customApi.model) || 'gpt-4o',
            maxTokens: (cfg.customApi && Number.isInteger(cfg.customApi.maxTokens)) ? cfg.customApi.maxTokens : 8192
          }
        }
      } catch (err) {
        return {
          customApi: {
            enabled: false,
            baseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            model: 'gpt-4o',
            maxTokens: 8192
          }
        }
      }
    }

    function saveConfig(cfg) {
      try {
        fs.mkdirSync(configDir, { recursive: true })
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8')
        return true
      } catch (err) {
        hlog('error', '保存配置失败: ' + err.message)
        return false
      }
    }

    function hlog(level, msg, detail) {
      hostLogs.push({ seq: seq++, t: Date.now(), level: level, src: 'host', msg: msg, detail: detail || null })
      if (hostLogs.length > MAX_LOGS) hostLogs.splice(0, hostLogs.length - MAX_LOGS)
    }

    function nextMessageId() {
      seq += 1
      return 'prompt-polish-' + Date.now().toString(36) + '-' + seq
    }

    hlog('info', 'host 插件启动（apply）')

    function buildSystemPrompt(instruction, round, total) {
      const lines = [
        '你是「提示词优化专家」，一个专职的提示词工程 agent。用户在向 AI 发送命令之前，会把草稿交给你，由你把它改写成符合提示词工程规范、效力更高的命令。',
        '',
        '你的核心职责：',
        '1. 补全不完整：识别缺失的要素（目标、对象、范围、约束、输出格式、验收标准、上下文），合理补全，使命令无需追问即可执行。',
        '2. 消除歧义：把含糊、笼统的表述改写成明确、具体、可执行的指令；必要时补充合理的默认约定。',
        '3. 结构优化：按提示词工程最佳实践组织命令，可包含角色设定、任务目标、输入、处理步骤、输出格式、约束与质量标准；只在原文需要时添加，不堆砌空话。',
        '4. 扩写增强：补充关键上下文、边界条件、质量要求和示例意图，提升命令效果；保持简洁有效，不注水。',
        '5. 忠实原意：绝不改变用户的真实意图，不新增与原意无关的目标，不删除用户的硬性要求。',
        '6. 语言一致：输出语言与用户输入一致。',
        '',
        '输出规则（必须严格遵守）：',
        '- 只输出优化后的命令正文本身。',
        '- 禁止任何解释、前言、总结、元评论或提问。',
        '- 禁止 Markdown 代码围栏、引号包裹、标题符号等包装。',
        '- 直接以正文开头、以正文结尾。'
      ]
      if (instruction) {
        lines.push('', '用户对本轮优化提出的补充要求：' + instruction)
      }
      if (total > 1) {
        lines.push('', '当前是第 ' + round + '/' + total + ' 轮迭代优化：请在前一轮结果的基础上继续打磨，重点消除仍不完整、仍模糊、结构混乱或冗余之处；每一轮都应比上一轮更精炼、更明确、更完整。')
      }
      return lines.join('\n')
    }

    async function resolveRoute() {
      const def = ctx.get('agentDefaultModel')
      if (def !== undefined) {
        try {
          const sel = def.currentSelection()
          if (sel && typeof sel.provider === 'string' && sel.provider && typeof sel.model === 'string' && sel.model) {
            return { provider: sel.provider, model: sel.model, reasoningEffort: sel.reasoningEffort }
          }
        } catch (err) {
          hlog('warn', '读取默认模型失败: ' + err.message)
        }
      }
      const providers = ctx.llm.listProviders()
      if (providers.length > 0) {
        const models = await ctx.llm.listModels(providers[0].id)
        if (models.length > 0) return { provider: providers[0].id, model: models[0].id }
      }
      throw new Error('prompt-polish: 无法解析可用的模型路由')
    }

    async function singlePolish(text, route, instruction, round, total) {
      const system = buildSystemPrompt(instruction, round, total)
      const message = {
        id: nextMessageId(),
        role: 'user',
        content: [{ type: 'text', text: text }],
        source: { kind: 'plugin', plugin: 'prompt-polish' }
      }
      const options = {
        provider: route.provider,
        model: route.model,
        messages: [message],
        system: system,
        maxTokens: 8192
      }
      if (route.reasoningEffort) options.reasoningEffort = route.reasoningEffort
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null
      let clearDeadline = null
      if (ctrl) {
        options.signal = ctrl.signal
        clearDeadline = ctx.timeout(function () { ctrl.abort() }, 120000)
      }
      const parts = []
      let finish = null
      try {
        for await (const chunk of ctx.llm.stream(options)) {
          if (chunk.type === 'block-start') {
            parts[chunk.index] = ''
          } else if (chunk.type === 'text-delta') {
            parts[chunk.index] = (parts[chunk.index] || '') + chunk.text
          } else if (chunk.type === 'finish') {
            finish = chunk.reason
          }
        }
      } finally {
        if (clearDeadline) clearDeadline()
      }
      if (!finish) throw new Error('prompt-polish: 模型流提前结束')
      if (finish.kind === 'error' || finish.kind === 'aborted') {
        throw new Error('prompt-polish: 模型调用失败 - ' + (finish.failure && finish.failure.message ? finish.failure.message : finish.kind))
      }
      if (finish.kind !== 'stop') {
        throw new Error('prompt-polish: 模型输出未正常结束 (' + finish.kind + ')')
      }
      const result = parts.filter(function (p) { return typeof p === 'string' && p.length > 0 }).join('\n').trim()
      if (!result) throw new Error('prompt-polish: 模型未返回优化结果')
      return result
    }

    /**
     * 通过自定义 OpenAI 兼容 API 调用模型（非流式）。
     * 支持 OpenAI / DeepSeek / Azure OpenAI / Ollama / vLLM / LM Studio 等。
     */
    async function customSinglePolish(text, customCfg, instruction, round, total) {
      const system = buildSystemPrompt(instruction, round, total)
      const baseUrl = customCfg.baseUrl.replace(/\/+$/, '')
      const url = baseUrl + '/chat/completions'
      const body = {
        model: customCfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text }
        ],
        max_tokens: customCfg.maxTokens || 8192,
        stream: false
      }
      const headers = { 'content-type': 'application/json' }
      if (customCfg.apiKey) headers['authorization'] = 'Bearer ' + customCfg.apiKey

      hlog('debug', '自定义 API 请求: ' + url + ' model=' + customCfg.model)

      const ctrl = typeof AbortController === 'function' ? new AbortController() : null
      let clearDeadline = null
      if (ctrl) {
        clearDeadline = ctx.timeout(function () { ctrl.abort() }, 120000)
      }
      let resp
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
          signal: ctrl ? ctrl.signal : undefined
        })
      } finally {
        if (clearDeadline) clearDeadline()
      }
      if (!resp.ok) {
        let errText = ''
        try { errText = await resp.text() } catch (e) { errText = '' }
        throw new Error('prompt-polish: 自定义 API 返回 HTTP ' + resp.status + ' - ' + errText.slice(0, 500))
      }
      const data = await resp.json()
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      if (!content || typeof content !== 'string' || !content.trim()) {
        throw new Error('prompt-polish: 自定义 API 未返回有效内容')
      }
      return content.trim()
    }

    function readJsonBody(req) {
      return new Promise(function (resolve, reject) {
        const chunks = []
        req.on('data', function (c) { chunks.push(c) })
        req.on('end', function () {
          try {
            const raw = Buffer.concat(chunks).toString('utf8')
            resolve(raw ? JSON.parse(raw) : {})
          } catch (err) {
            reject(new Error('prompt-polish: 请求体不是合法 JSON'))
          }
        })
        req.on('error', reject)
      })
    }

    function summarize(text) {
      const t = String(text || '')
      return t.length <= 60 ? t : t.slice(0, 60) + '…(' + t.length + '字符)'
    }

    async function polishRun(args) {
      const a = (args && typeof args === 'object') ? args : {}
      const text = typeof a.text === 'string' ? a.text.trim() : ''
      if (!text) throw new Error('prompt-polish: 输入文本为空')
      let rounds = 1
      if (Number.isInteger(a.rounds)) rounds = Math.min(6, Math.max(1, a.rounds))
      const instruction = typeof a.instruction === 'string' ? a.instruction.trim() : ''
      hlog('info', '收到 polish 请求', 'text=' + summarize(text) + ' rounds=' + rounds + (instruction ? ' instruction=' + summarize(instruction) : ''))
      const started = Date.now()

      /* 读取配置，决定使用自定义 API 还是 dsh 内置路由 */
      const cfg = loadConfig()
      const useCustom = cfg.customApi.enabled && cfg.customApi.baseUrl && cfg.customApi.model

      try {
        let routeLabel
        let route = null
        if (useCustom) {
          routeLabel = 'custom-api: ' + cfg.customApi.baseUrl + ' / ' + cfg.customApi.model
          hlog('debug', '使用自定义 API: ' + routeLabel)
        } else {
          route = await resolveRoute()
          routeLabel = route.provider + ' / ' + route.model + (route.reasoningEffort ? ' (effort=' + route.reasoningEffort + ')' : '')
          hlog('debug', '使用 dsh 模型路由: ' + routeLabel)
        }
        let current = text
        const versions = []
        for (let i = 1; i <= rounds; i += 1) {
          if (useCustom) {
            current = await customSinglePolish(current, cfg.customApi, instruction, i, rounds)
          } else {
            current = await singlePolish(current, route, instruction, i, rounds)
          }
          versions.push(current)
        }
        const ms = Date.now() - started
        stats.polishOk += 1
        stats.lastOkMs = ms
        hlog('info', 'polish 完成: ' + versions.length + ' 版, 耗时 ' + ms + 'ms', 'route=' + routeLabel + ' 首版长度=' + versions[0].length)
        return { versions: versions, route: useCustom ? { provider: 'custom-api', model: cfg.customApi.model } : { provider: routeLabel.split(' / ')[0], model: routeLabel.split(' / ')[1] } }
      } catch (err) {
        const ms = Date.now() - started
        stats.polishFail += 1
        stats.lastError = (err && err.message) ? err.message : String(err)
        hlog('error', 'polish 失败 (' + ms + 'ms): ' + stats.lastError, (err && err.stack) ? String(err.stack).split('\n').slice(0, 4).join('\n') : null)
        throw err
      }
    }

    function health() {
      const cfg = loadConfig()
      let defaultModel = null
      const def = ctx.get('agentDefaultModel')
      if (def !== undefined) {
        try { defaultModel = def.currentSelection() } catch (err) { defaultModel = { error: err.message } }
      }
      let providers = []
      try { providers = ctx.llm.listProviders().map(function (p) { return p.id }) } catch (err) { providers = ['<error: ' + err.message + '>'] }
      return {
        ok: true,
        startedAt: stats.startedAt,
        polishOk: stats.polishOk,
        polishFail: stats.polishFail,
        lastError: stats.lastError,
        lastOkMs: stats.lastOkMs,
        defaultModel: defaultModel,
        llmProviders: providers,
        customApi: {
          enabled: cfg.customApi.enabled,
          baseUrl: cfg.customApi.baseUrl,
          model: cfg.customApi.model,
          hasApiKey: !!cfg.customApi.apiKey,
          maxTokens: cfg.customApi.maxTokens
        }
      }
    }

    hlog('info', 'host 就绪：/pp-api/polish + /pp-api/logs + /pp-api/config 已注册')

    ctx.effect(function () {
      return ctx.webServer.register({
        kind: 'exact',
        path: '/pp-api/polish',
        handler: async function (req, res) {
          try {
            if (req.method !== 'POST') {
              res.writeHead(405, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ error: 'method not allowed' }))
              return
            }
            const args = await readJsonBody(req)
            const result = await polishRun(args)
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: (err && err.message) ? err.message : String(err) }))
          }
        }
      })
    })

    ctx.effect(function () {
      return ctx.webServer.register({
        kind: 'exact',
        path: '/pp-api/logs',
        handler: async function (req, res) {
          try {
            if (req.method !== 'GET') {
              res.writeHead(405, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ error: 'method not allowed' }))
              return
            }
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ logs: hostLogs.slice(), health: health() }))
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: (err && err.message) ? err.message : String(err) }))
          }
        }
      })
    })

    /* ── 配置读写接口 ─────────────────────────────────────────────── */
    ctx.effect(function () {
      return ctx.webServer.register({
        kind: 'exact',
        path: '/pp-api/config',
        handler: async function (req, res) {
          try {
            if (req.method === 'GET') {
              const cfg = loadConfig()
              /* 返回时对 apiKey 脱敏，只暴露是否已设置 */
              const safe = {
                customApi: {
                  enabled: cfg.customApi.enabled,
                  baseUrl: cfg.customApi.baseUrl,
                  apiKey: cfg.customApi.apiKey ? ('****' + cfg.customApi.apiKey.slice(-4)) : '',
                  hasApiKey: !!cfg.customApi.apiKey,
                  model: cfg.customApi.model,
                  maxTokens: cfg.customApi.maxTokens
                }
              }
              res.writeHead(200, { 'content-type': 'application/json' })
              res.end(JSON.stringify(safe))
              return
            }
            if (req.method === 'POST') {
              const body = await readJsonBody(req)
              const cur = loadConfig()
              const incoming = body.customApi || {}
              const newCfg = {
                customApi: {
                  enabled: !!incoming.enabled,
                  baseUrl: typeof incoming.baseUrl === 'string' ? incoming.baseUrl.trim() : cur.customApi.baseUrl,
                  apiKey: typeof incoming.apiKey === 'string' && incoming.apiKey && !incoming.apiKey.startsWith('****')
                    ? incoming.apiKey.trim() : cur.customApi.apiKey,
                  model: typeof incoming.model === 'string' ? incoming.model.trim() : cur.customApi.model,
                  maxTokens: Number.isInteger(incoming.maxTokens) ? incoming.maxTokens : cur.customApi.maxTokens
                }
              }
              const ok = saveConfig(newCfg)
              hlog('info', '配置已保存: customApi.enabled=' + newCfg.customApi.enabled + ' model=' + newCfg.customApi.model + ' baseUrl=' + newCfg.customApi.baseUrl)
              res.writeHead(200, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ ok: ok }))
              return
            }
            res.writeHead(405, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'method not allowed' }))
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: (err && err.message) ? err.message : String(err) }))
          }
        }
      })
    })
  }
}
