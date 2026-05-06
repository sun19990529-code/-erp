const expressRouter = require('express');
const router = expressRouter.Router();
const axios = require('axios');
const { requirePermission } = require('../middleware/permission');
let broadcastWechatMsg = null;
try { broadcastWechatMsg = require('../services/wechatBot').broadcastWechatMsg; } catch { }

// 辅助函数：获取设置
const getAISettings = async (db) => {
  try {
    const row = await db.get("SELECT * FROM ai_models WHERE is_active = 1 LIMIT 1");
    if (row) {
      return {
        baseUrl: row.base_url,
        apiKey: row.api_key,
        model: row.model,
        wechatWebhook: row.wechat_webhook || ''
      };
    }
  } catch (e) { console.error('[getAISettings] DB error:', e.message); }
  return {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    wechatWebhook: ''
  };
};

// 辅助函数：获取数据库结构 (支持 PostgreSQL 和 SQLite)
const getDatabaseSchema = async (db) => {
  try {
    // 尝试 PostgreSQL
    const rows = await db.all(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
    `);
    
    if (rows && rows.length > 0) {
      const schemaMap = {};
      for (const row of rows) {
        if (!schemaMap[row.table_name]) schemaMap[row.table_name] = [];
        schemaMap[row.table_name].push(row.column_name);
      }
      let schemaStr = '';
      for (const table in schemaMap) {
        schemaStr += `Table ${table}: ${schemaMap[table].join(', ')}\n`;
      }
      return schemaStr;
    }
  } catch (e) {
    // 失败则降级尝试 SQLite
  }

  try {
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    let schemaStr = '';
    for (const t of tables) {
      const cols = await db.all(`PRAGMA table_info(${t.name})`);
      schemaStr += `Table ${t.name}: ${cols.map(c => c.name).join(', ')}\n`;
    }
    return schemaStr;
  } catch (e) {
    console.error('[AI Schema Error]', e.message);
    return '无法获取数据库结构';
  }
};

// ==================== GET /api/ai/configs ====================
router.get('/configs', requirePermission('admin'), async (req, res) => {
  try {
    const list = await req.db.all('SELECT * FROM ai_models ORDER BY id DESC');
    res.json({ success: true, data: list.map(item => ({
      ...item,
      api_key: '', // 不向前端返回密钥，编辑时留空表示不修改
      has_api_key: !!item.api_key, // 给前端展示用
      status: item.is_active // 映射给 SimpleCRUDManager 的 hasStatus 判断
    })) });
  } catch (error) {
    console.error('[AI Configs GET]', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== POST /api/ai/configs ====================
router.post('/configs', requirePermission('admin'), async (req, res) => {
  try {
    const { name, base_url, api_key, model, wechat_webhook } = req.body;
    if (!name?.trim() || !base_url?.trim() || !api_key?.trim() || !model?.trim()) {
      return res.status(400).json({ success: false, message: '配置名称、API地址、API Key、模型名称均为必填项' });
    }
    await req.db.run(`
      INSERT INTO ai_models (name, base_url, api_key, model, wechat_webhook, is_active)
      VALUES (?, ?, ?, ?, ?, 0)
    `, [name, base_url, api_key, model, wechat_webhook || '']);
    res.json({ success: true, message: '配置已添加' });
  } catch (error) {
    console.error('[AI Configs POST]', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== PUT /api/ai/configs/:id ====================
router.put('/configs/:id', requirePermission('admin'), async (req, res) => {
  try {
    const { name, base_url, api_key, model, wechat_webhook } = req.body;
    if (!name?.trim() || !base_url?.trim() || !model?.trim()) {
      return res.status(400).json({ success: false, message: '配置名称、API地址、模型名称均为必填项' });
    }
    // 如果 api_key 为空，说明用户不想修改密钥，跳过更新该字段
    if (api_key?.trim()) {
      await req.db.run(`
        UPDATE ai_models 
        SET name = ?, base_url = ?, api_key = ?, model = ?, wechat_webhook = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, base_url, api_key, model, wechat_webhook || '', req.params.id]);
    } else {
      await req.db.run(`
        UPDATE ai_models 
        SET name = ?, base_url = ?, model = ?, wechat_webhook = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, base_url, model, wechat_webhook || '', req.params.id]);
    }
    res.json({ success: true, message: '配置已更新' });
  } catch (error) {
    console.error('[AI Configs PUT]', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== DELETE /api/ai/configs/:id ====================
router.delete('/configs/:id', requirePermission('admin'), async (req, res) => {
  try {
    const target = await req.db.get('SELECT is_active FROM ai_models WHERE id = ?', [req.params.id]);
    if (target && target.is_active === 1) {
      return res.status(400).json({ success: false, message: '无法删除当前正在使用的活跃配置，请先切换到其他配置后再删除。' });
    }
    await req.db.run(`DELETE FROM ai_models WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: '配置已删除' });
  } catch (error) {
    console.error('[AI Configs DELETE]', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== PUT /api/ai/configs/:id/toggle-status ====================
router.put('/configs/:id/toggle-status', requirePermission('admin'), async (req, res) => {
  try {
    const target = await req.db.get(`SELECT is_active FROM ai_models WHERE id = ?`, [req.params.id]);
    if (!target) return res.status(404).json({success: false, message: '记录不存在'});
    
    await req.db.transaction(async () => {
      if (target.is_active === 0) {
        // 先全部禁用
        await req.db.run(`UPDATE ai_models SET is_active = 0`);
        // 启用当前
        await req.db.run(`UPDATE ai_models SET is_active = 1 WHERE id = ?`, [req.params.id]);
      } else {
        await req.db.run(`UPDATE ai_models SET is_active = 0 WHERE id = ?`, [req.params.id]);
      }
    });
    
    res.json({ success: true, message: '状态已更新' });
  } catch (error) {
    console.error('[AI Configs TOGGLE]', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== POST /api/ai/chat ====================
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ success: false, message: '请先登录后再使用 AI 助手' });
    }
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: '无效的消息格式' });
    }

    const settings = await getAISettings(req.db);
    if (!settings.apiKey) {
      return res.status(400).json({ success: false, message: '系统未配置 AI API Key，请联系管理员配置。' });
    }

    // 动态生成基于角色的系统级提示词 (System Prompt)
    let systemPrompt = '';
    const isExternalUser = user?.role_code === 'customer_user' || user?.role_code === 'supplier_user';

    if (isExternalUser) {
      systemPrompt = `你是一个专业的 ERP-MES 系统外部服务助手。
当前与你对话的用户身份信息如下：
- 姓名：${user?.real_name || user?.username || '未知'}
- 角色：${user?.role_code || '未知'} (外部伙伴)

【最高安全指令】
1. 你的回答必须专业、友好、简洁。
2. 你**没有任何权限**访问公司的底层ERP数据库，也**绝对无法**看到任何其他客户/供应商的数据、产品成本价、内部利润率或库存明细。
3. 如果用户询问任何具体的业务数据（例如“我的订单XXX进度如何”、“产品YYY的价格是多少”、“库存还有多少”），你**必须明确拒绝**，并回复：“抱歉，为了您的数据隐私与系统安全，AI 助手未被授权直接访问底层业务数据。请您在系统的相应菜单中自助查询，或联系您的专属业务员。”
4. **绝对不要**猜测、编造或模拟任何业务数据、订单号或财务数字！
5. 你具备调用企业微信通知的能力。如果用户在系统中遇到报错或需要紧急反馈，你可以调用 send_to_wechat_group 工具将情况反馈给企业内部。`;
    } else {
      const dbSchema = await getDatabaseSchema(req.db);
      systemPrompt = `你是一个专业的 ERP-MES 系统的内部私人 AI 助理。
当前与你对话的用户身份信息如下：
- 姓名：${user?.real_name || user?.username || '未知'}
- 角色：${user?.role_code || '未知'} (内部员工)

你被赋予了高级的底层数据库只读查询能力 (query_database)。
当前系统的数据库结构如下：
--- Database Schema ---
${dbSchema}
-----------------------

请注意：
1. 当内部员工询问具体的业务数据（如：库存还有多少、某单号进度、报表统计等）时，你**必须**调用 \`query_database\` 工具，自己编写标准 SQL 来查询出结果，然后再回答用户。不要说“由于我是AI无法查询”，你现在已经有工具了！
2. 你的回答必须专业、简洁。
3. 你具备调用企业微信通知的能力。如果用户的意图包含“求助”、“需要反馈”、“遇到严重问题”、“帮忙发到内部群”等，你可以调用 send_to_wechat_group 工具将情况反馈给企业内部。`;
    }

    // 构建最终发送给大模型的消息数组
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // 定义 Function Calling 工具
    const tools = [];
    const hasWechatPush = settings.wechatWebhook || (broadcastWechatMsg != null);
    if (hasWechatPush) {
      tools.push({
        type: 'function',
        function: {
          name: 'send_to_wechat_group',
          description: '将用户的紧急求助、反馈或报警信息发送到企业微信内部群聊中',
          parameters: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: '发送给企业微信的 Markdown 格式的具体内容，包括用户反馈的问题详情'
              }
            },
            required: ['content']
          }
        }
      });
    }

    if (!isExternalUser) {
      tools.push({
        type: 'function',
        function: {
          name: 'query_database',
          description: '执行 SQL 查询以获取 ERP 系统底层的真实数据。这会在后端一个安全的只读事务沙箱中执行。',
          parameters: {
            type: 'object',
            properties: {
              sql: {
                type: 'string',
                description: '你要执行的 PostgreSQL / SQLite 兼容的查询 SQL 语句。请确保是标准的 SELECT 查询。'
              }
            },
            required: ['sql']
          }
        }
      });
    }

    // 调用 OpenAI 兼容的 API
    const MAX_TOOL_ROUNDS = 5; // 安全阀：防止大模型异常导致无限循环烧光 API 额度
    let isFinished = false;
    let finalMessage = null;
    let toolRound = 0;

    while (!isFinished) {
      if (++toolRound > MAX_TOOL_ROUNDS) {
        finalMessage = { role: 'assistant', content: '[系统提示] AI 工具调用轮次已达上限，已强制终止。请尝试简化您的问题。' };
        break;
      }
      const response = await axios.post(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        model: settings.model || 'deepseek-chat',
        messages: llmMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
      }, {
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60秒超时
      });

      const responseMessage = response.data.choices[0].message;
      llmMessages.push(responseMessage); // 先把 AI 的这一轮回复压入上下文

      // 处理 Function Calling
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.function.name === 'send_to_wechat_group') {
            let args;
            try { args = JSON.parse(toolCall.function.arguments); } catch { args = { content: toolCall.function.arguments }; }
            let sendMsg = '';
            
            try {
               const msgContent = `**<font color="warning">【AI 助手代发】</font>**\n**反馈人**：${user?.real_name} (${user?.role_code})\n\n**详情**：\n${args.content}`;
               
               if (settings.wechatWebhook) {
                 // 优先走 Webhook
                 const wxRes = await axios.post(settings.wechatWebhook, {
                   msgtype: 'markdown',
                   markdown: { content: msgContent }
                 });
                 if (wxRes.data && wxRes.data.errcode === 0) {
                   sendMsg = '已成功将信息推送到企业微信群。';
                 } else {
                   sendMsg = `推送企业微信失败：${wxRes.data.errmsg}`;
                 }
               } else if (broadcastWechatMsg) {
                 // 兜底走长连接机器人
                 const ok = await broadcastWechatMsg(msgContent);
                 sendMsg = ok ? '已通过企微机器人推送成功。' : '企微机器人未连接或无活跃群，推送失败。';
               } else {
                 sendMsg = '未配置推送通道。';
               }
            } catch (e) {
               console.error('[WeChat Webhook Error]', e.message);
               sendMsg = `推送企业微信异常：${e.message}`;
            }

            llmMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: sendMsg
            });
          }
          else if (toolCall.function.name === 'query_database') {
            let args;
            try { args = JSON.parse(toolCall.function.arguments); } catch { args = { sql: '' }; }
            let sql = (args.sql || '').trim();
            let queryResultStr = '';

            try {
              if (!sql.toUpperCase().startsWith('SELECT')) {
                throw new Error('出于安全考虑，只允许执行 SELECT 查询。');
              }

              let rows = [];
              try {
                await req.db.transaction(async () => {
                  await req.db.run('SET TRANSACTION READ ONLY');
                  rows = await req.db.all(sql);
                  throw new Error('FORCE_ROLLBACK_FOR_SAFETY');
                });
              } catch (dbErr) {
                if (dbErr.message !== 'FORCE_ROLLBACK_FOR_SAFETY') {
                  throw dbErr;
                }
              }

              queryResultStr = JSON.stringify(rows || []);
              if (queryResultStr.length > 3000) {
                queryResultStr = queryResultStr.substring(0, 3000) + '... (数据过长已截断)';
              }
            } catch (e) {
               console.error('[AI Query Error]', e.message);
               queryResultStr = `SQL执行失败: ${e.message}`;
            }

            llmMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: queryResultStr
            });
          }
        }
        // 当本次所有的 tool_calls 都执行完毕并将结果压入 llmMessages 后，
        // while 循环会自动进入下一轮，重新向 OpenAI 发起请求。
      } else {
        // 如果没有 tool_calls，说明 AI 已经得出了最终回答，退出循环
        isFinished = true;
        finalMessage = responseMessage;
      }
    }

    // 正常文本或多模态回复
    res.json({ success: true, data: finalMessage });
    
  } catch (error) {
    console.error('[AI Chat POST]', error?.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      message: error?.response?.data?.error?.message || '请求 AI 模型失败' 
    });
  }
});

module.exports = { router };
