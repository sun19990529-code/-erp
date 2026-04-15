const fs = require('fs');
const path = require('path');
const AiBot = require('aibot-node-sdk');

const TARGETS_FILE = path.join(__dirname, '../config/wechat_targets.json');
const MAX_TARGETS = 20; // 群 ID 上限，防止被拉入大量群后广播拖慢 (#4)

let pushTargets = new Set();

try {
  if (fs.existsSync(TARGETS_FILE)) {
    const data = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8'));
    pushTargets = new Set((data.targets || []).slice(0, MAX_TARGETS));
  }
} catch (e) {
  console.warn('[WechatBot] 加载群目标历史记录失败:', e.message);
}

// 异步写入，避免阻塞事件循环 (#1)
function saveTargets() {
  const configDir = path.join(__dirname, '../config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFile(
    TARGETS_FILE,
    JSON.stringify({ targets: Array.from(pushTargets) }, null, 2),
    (err) => { if (err) console.error('[WechatBot] 保存群目标失败:', err.message); }
  );
}

let wsClient = null;

/**
 * 初始化企微长连接智能机器人
 * @param {object} dbInstance - dbHelper 实例，其生命周期与进程一致（单例），不会出现过时闭包 (#5)
 */
async function initWechatBot(dbInstance) {
  const botId = process.env.WECOM_BOT_ID;
  const secret = process.env.WECOM_BOT_SECRET;

  if (!botId || !secret) {
    console.log('⚠️ [WechatBot] 未配置 WECOM_BOT_ID / WECOM_BOT_SECRET。长连接功能不启动。');
    return;
  }

  // 获取 WSClient（兼容 CJS/ESM 双模块格式）
  const WSClient = AiBot.WSClient || (AiBot.default && AiBot.default.WSClient) || AiBot;

  // 模块顶部缓存 handleCommand 引用，避免每次消息都走 require 缓存查找 (#2)
  const { handleCommand } = require('../routes/bot');

  try {
    wsClient = new WSClient({
      botId,
      secret,
      maxReconnectAttempts: -1 // 无限重连，适合工厂 7×24 场景
    });

    wsClient.on('authenticated', () => {
      console.log('✅ [WechatBot] 智能企微机器狗已成功连上腾讯云，随时听命！');
    });

    wsClient.on('error', (err) => {
      console.error('❌ [WechatBot] 长连接异常:', err.message);
    });

    wsClient.on('disconnected', (reason) => {
      console.log('⚠️ [WechatBot] 连接断开:', reason);
    });

    wsClient.on('message.text', async (frame) => {
      const text = frame.body.text?.content || '';
      console.log(`[WechatBot] 收到指令: ${text}`);

      // 智能捕捉：不管是单聊(userid)还是群聊(chatid)，只要互动了，就加为默认广播群
      const targetId = frame.body.chatid || frame.body.from?.userid;
      if (targetId && !pushTargets.has(targetId)) {
        // 群 ID 数量达上限时移除最早加入的 (#4)
        if (pushTargets.size >= MAX_TARGETS) {
          const oldest = pushTargets.values().next().value;
          pushTargets.delete(oldest);
          console.log(`[WechatBot] 群 ID 达到上限 ${MAX_TARGETS}，移除最早: ${oldest}`);
        }
        pushTargets.add(targetId);
        saveTargets();
        console.log(`[WechatBot] 捕捉到最新汇报群体 ID: ${targetId}`);
      }

      // 请求核心大脑
      const result = await handleCommand(text, dbInstance);

      // 发送最终流式闭合回答
      const reqId = (AiBot.generateReqId && typeof AiBot.generateReqId === 'function')
          ? AiBot.generateReqId('stream')
          : `stream_${Date.now()}`;

      try {
        if (typeof wsClient.replyStream === 'function') {
           await wsClient.replyStream(frame, reqId, result.content, true);
        } else {
           await wsClient.sendMessage(targetId, {
             msgtype: 'markdown',
             markdown: { content: result.content }
           });
        }
      } catch (e) {
        console.error('❌ [WechatBot] 回复失败:', e.message);
      }
    });

    wsClient.connect();
  } catch (error) {
    console.error('❌ [WechatBot] 驱动初始化失败:', error);
  }
}

/**
 * 暴露给系统全局的异步推送钩子
 * 使用 Promise.allSettled 并行广播，避免串行延迟 (#7)
 */
async function broadcastWechatMsg(markdownText) {
  if (!wsClient || !wsClient.isConnected) {
     return false;
  }
  if (pushTargets.size === 0) {
     console.log('⚠️ [WechatBot] 企微机器人想发通知，但未抓取过任何群 ID。请先在群里艾特一次机器人激活它！');
     return false;
  }

  const tasks = Array.from(pushTargets).map(targetId =>
    wsClient.sendMessage(targetId, {
      msgtype: 'markdown',
      markdown: { content: markdownText }
    }).then(() => {
      console.log(`[WechatBot] 向会话 [${targetId}] Push成功！`);
      return true;
    }).catch(err => {
      console.error(`[WechatBot] 向会话 [${targetId}] Push失败:`, err.message);
      return false;
    })
  );

  const results = await Promise.allSettled(tasks);
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  return successCount > 0;
}

module.exports = { initWechatBot, broadcastWechatMsg };
