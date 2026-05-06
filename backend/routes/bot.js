/**
 * 群机器人交互回调处理
 * 支持钉钉/企业微信 Outgoing Webhook
 * 
 * 使用方式：
 *   1. 钉钉：群机器人设置 → 自定义(outgoing) → 回调地址填 http://你的公网IP:3198/api/bot/dingtalk
 *   2. 企业微信：群机器人暂不支持主动回调，可通过企业微信应用消息实现
 * 
 * 支持的关键词：
 *   生产状态 / 日报      → 生产概览
 *   查询 PO-xxx / 工单 PO-xxx → 查询工单详情
 *   订单 SO-xxx          → 查询订单状态
 *   库存 xxx             → 查询产品库存
 *   帮助                 → 显示命令列表
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

// ==================== 关键词路由 ====================

/**
 * 解析用户消息并返回对应的查询结果
 * @param {string} text - 用户发送的消息文本
 * @param {object} db - 数据库实例
 * @returns {object} { title, content } markdown 格式的回复
 */
async function handleCommand(text, db) {
  const msg = text.trim().replace(/^@\S+\s*/, ''); // 去掉 @机器人 前缀

  // 帮助
  if (/^(帮助|help|菜单|命令)$/i.test(msg)) {
    return {
      title: '📖 命令帮助',
      content: [
        '### 📖 铭晟ERP 机器人命令',
        '| 命令 | 说明 |',
        '|------|------|',
        '| **生产状态** | 查看当前生产概览 |',
        '| **日报** | 推送今日生产日报 |',
        '| **工单 PO-xxx** | 查询工单详情 |',
        '| **订单 SO-xxx** | 查询订单状态 |',
        '| **库存 产品名** | 查询产品库存 |',
        '| **超期检查** | 检查超期订单 |',
        '| **帮助** | 显示本帮助信息 |',
      ].join('\n')
    };
  }

  // 生产状态 / 日报
  if (/^(生产状态|日报|生产日报|production|status)$/i.test(msg)) {
    return await queryProductionSummary(db);
  }

  // 查询工单：工单 PO-xxx 或 查询 PO-xxx
  const poMatch = msg.match(/(?:工单|查询|po)\s*(PO-[\w-]+)/i);
  if (poMatch) {
    return await queryProductionOrder(db, poMatch[1]);
  }

  // 查询订单：订单 SO-xxx
  const soMatch = msg.match(/(?:订单|order|so)\s*(SO-[\w-]+)/i);
  if (soMatch) {
    return await querySalesOrder(db, soMatch[1]);
  }

  // 库存查询：库存 产品名
  const invMatch = msg.match(/(?:库存|inventory|stock)\s+(.+)/i);
  if (invMatch) {
    return await queryInventory(db, invMatch[1].trim());
  }

  // 超期检查
  if (/^(超期|超期检查|overdue)$/i.test(msg)) {
    return await queryOverdue(db);
  }

  // 未匹配固定指令 → 转发给 AI 大模型
  try {
    const aiConfig = await db.get('SELECT * FROM ai_models WHERE is_active = 1 LIMIT 1');
    if (aiConfig && aiConfig.api_key && aiConfig.base_url) {
      const response = await axios.post(
        `${aiConfig.base_url}/chat/completions`,
        {
          model: aiConfig.model,
          messages: [
            { role: 'system', content: '你是铭晟ERP系统的企微群助手。请用简洁友好的中文回答问题。如果用户的问题涉及ERP系统操作，可以引导他们使用固定指令（生产状态、日报、工单 PO-xxx、订单 SO-xxx、库存 产品名、超期检查、帮助）。' },
            { role: 'user', content: msg }
          ],
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${aiConfig.api_key}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      const aiReply = response.data.choices?.[0]?.message?.content || '抱歉，AI 暂时无法回答。';
      return { title: '🤖 AI 回复', content: aiReply };
    }
  } catch (e) {
    console.error('[bot] AI fallback error:', e.message);
  }

  // AI 也不可用时的兜底
  return {
    title: '🤖 未识别命令',
    content: `抱歉，未识别命令「${msg}」。\n\n发送 **帮助** 查看支持的命令列表。`
  };
}

// ==================== 查询函数 ====================

/** 生产概览 */
async function queryProductionSummary(db) {
  const pending = await db.get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
  const processing = await db.get("SELECT COUNT(*) as count FROM production_orders WHERE status = 'processing'");
  const qualityHold = await db.get("SELECT COUNT(*) as count FROM production_orders WHERE status = 'quality_hold'");
  const pendingInsp = await db.get("SELECT COUNT(*) as count FROM final_inspections WHERE result IS NULL");

  // 工单进度 TOP5
  const top5 = await db.all(`
    SELECT po.order_no, p.name as product_name,
      CASE WHEN po.quantity > 0 THEN ROUND(po.completed_quantity * 100.0 / po.quantity, 1) ELSE 0 END as progress
    FROM production_orders po
    JOIN products p ON po.product_id = p.id
    WHERE po.status = 'processing'
    ORDER BY po.created_at DESC LIMIT 5
  `);

  // 交期预警
  const alerts = await db.all(`
    SELECT order_no, customer_name, delivery_date,
      (delivery_date::date - CURRENT_DATE) as days_left
    FROM orders
    WHERE status NOT IN ('completed', 'cancelled')
      AND delivery_date IS NOT NULL
      AND (delivery_date::date - CURRENT_DATE) <= 3
    ORDER BY delivery_date ASC LIMIT 5
  `);

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  let content = [
    `### 📊 铭晟ERP 生产状态 (${dateStr})`,
    '',
    `| 指标 | 数量 |`,
    `|------|------|`,
    `| 📦 待排产订单 | ${pending?.count || 0} |`,
    `| 🔧 进行中工单 | ${processing?.count || 0} |`,
    `| ⚠️ 质检暂停 | ${qualityHold?.count || 0} |`,
    `| 📋 待检验 | ${pendingInsp?.count || 0} |`,
  ];

  if (top5.length > 0) {
    content.push('', '**🔝 工单进度:**');
    top5.forEach((o, i) => {
      const bar = '█'.repeat(Math.floor(o.progress / 10)) + '░'.repeat(10 - Math.floor(o.progress / 10));
      content.push(`${i + 1}. ${o.order_no} ${o.product_name} ${bar} ${o.progress}%`);
    });
  }

  if (alerts.length > 0) {
    content.push('', '**⚠️ 交期预警:**');
    alerts.forEach(a => {
      const urgency = a.days_left <= 0 ? '🔴已超期' : `🟡${a.days_left}天后到期`;
      content.push(`- ${a.order_no} ${a.customer_name} ${urgency}`);
    });
  }

  return { title: `📊 生产状态 (${dateStr})`, content: content.join('\n') };
}

/** 查询工单详情 */
async function queryProductionOrder(db, orderNo) {
  const po = await db.get(`
    SELECT po.*, p.name as product_name, p.unit,
      CASE WHEN po.quantity > 0 THEN ROUND(po.completed_quantity * 100.0 / po.quantity, 1) ELSE 0 END as progress,
      o.order_no as sales_order_no, o.customer_name
    FROM production_orders po
    JOIN products p ON po.product_id = p.id
    LEFT JOIN orders o ON po.order_id = o.id
    WHERE po.order_no = ?
  `, [orderNo.toUpperCase()]);

  if (!po) return { title: '❌ 未找到', content: `未找到工单 **${orderNo}**，请检查编号是否正确。` };

  const statusMap = {
    pending: '⏳待生产', processing: '🔧生产中', completed: '✅已完成',
    cancelled: '❌已取消', quality_hold: '⚠️质检暂停'
  };

  // 工序进度
  const processes = await db.all(`
    SELECT ppr.*, pr.name as process_name
    FROM production_process_records ppr
    JOIN processes pr ON ppr.process_id = pr.id
    WHERE ppr.production_order_id = ?
    ORDER BY pr.sequence
  `, [po.id]);

  let content = [
    `### 🔍 工单详情: ${po.order_no}`,
    '',
    `| 项目 | 信息 |`,
    `|------|------|`,
    `| 产品 | ${po.product_name} |`,
    `| 状态 | ${statusMap[po.status] || po.status} |`,
    `| 进度 | ${po.progress}% (${po.completed_quantity}/${po.quantity} ${po.unit}) |`,
    `| 当前工序 | ${po.current_process || '-'} |`,
    po.sales_order_no ? `| 销售订单 | ${po.sales_order_no} (${po.customer_name}) |` : null,
  ].filter(Boolean);

  if (processes.length > 0) {
    content.push('', '**工序进度:**');
    processes.forEach(p => {
      const icon = p.status === 'completed' ? '✅' : p.status === 'in_progress' ? '🔧' : '⏳';
      content.push(`${icon} ${p.process_name}: ${p.output_quantity || 0} 完成`);
    });
  }

  return { title: `🔍 工单 ${po.order_no}`, content: content.join('\n') };
}

/** 查询订单状态 */
async function querySalesOrder(db, orderNo) {
  const order = await db.get(`SELECT * FROM orders WHERE order_no = ?`, [orderNo.toUpperCase()]);
  if (!order) return { title: '❌ 未找到', content: `未找到订单 **${orderNo}**，请检查编号是否正确。` };

  const statusMap = {
    pending: '⏳待确认', confirmed: '✅已确认', processing: '🔧生产中',
    completed: '🎉已完成', cancelled: '❌已取消'
  };

  // 关联工单
  const productions = await db.all(`
    SELECT order_no, status,
      CASE WHEN quantity > 0 THEN ROUND(completed_quantity * 100.0 / quantity, 1) ELSE 0 END as progress
    FROM production_orders WHERE order_id = ?
  `, [order.id]);

  let content = [
    `### 📦 订单详情: ${order.order_no}`,
    '',
    `| 项目 | 信息 |`,
    `|------|------|`,
    `| 客户 | ${order.customer_name || '-'} |`,
    `| 状态 | ${statusMap[order.status] || order.status} |`,
    `| 总金额 | ¥${order.total_amount || 0} |`,
    order.delivery_date ? `| 交期 | ${order.delivery_date} |` : null,
  ].filter(Boolean);

  if (productions.length > 0) {
    content.push('', '**关联工单:**');
    productions.forEach(p => {
      content.push(`- ${p.order_no} ${p.progress}%`);
    });
  }

  return { title: `📦 订单 ${order.order_no}`, content: content.join('\n') };
}

/** 查询库存 */
async function queryInventory(db, keyword) {
  const products = await db.all(`
    SELECT p.code, p.name, p.unit, p.category, p.min_stock,
      COALESCE(inv.total, 0) as stock
    FROM products p
    LEFT JOIN (SELECT product_id, SUM(quantity) as total FROM inventory GROUP BY product_id) inv
      ON inv.product_id = p.id
    WHERE p.name LIKE ? OR p.code LIKE ?
    ORDER BY p.name LIMIT 10
  `, [`%${keyword}%`, `%${keyword}%`]);

  if (products.length === 0) {
    return { title: '🔍 库存查询', content: `未找到匹配「${keyword}」的产品。` };
  }

  let content = [
    `### 📦 库存查询: ${keyword}`,
    '',
    '| 编码 | 名称 | 库存 | 安全库存 | 状态 |',
    '|------|------|------|----------|------|',
  ];

  products.forEach(p => {
    const warning = (p.min_stock > 0 && p.stock < p.min_stock) ? '⚠️不足' : '✅正常';
    content.push(`| ${p.code} | ${p.name} | ${p.stock} ${p.unit} | ${p.min_stock || '-'} | ${warning} |`);
  });

  return { title: `📦 库存查询: ${keyword}`, content: content.join('\n') };
}

/** 超期检查 */
async function queryOverdue(db) {
  const today = new Date().toISOString().slice(0, 10);

  const overdueOrders = await db.all(
    `SELECT order_no, customer_name, delivery_date FROM orders WHERE status NOT IN ('completed', 'cancelled') AND delivery_date < ? AND delivery_date IS NOT NULL ORDER BY delivery_date LIMIT 10`,
    [today]
  );
  const overduePurchases = await db.all(
    `SELECT order_no, expected_date FROM purchase_orders WHERE status NOT IN ('completed', 'received', 'cancelled') AND expected_date < ? AND expected_date IS NOT NULL ORDER BY expected_date LIMIT 10`,
    [today]
  );

  if (overdueOrders.length === 0 && overduePurchases.length === 0) {
    return { title: '✅ 无超期', content: '### ✅ 当前无超期单据\n\n所有订单和采购单均在正常交期内。' };
  }

  let content = [`### ⚠️ 超期检查 (${today})`, ''];

  if (overdueOrders.length > 0) {
    content.push('**📦 超期订单:**');
    overdueOrders.forEach(o => content.push(`- 🔴 ${o.order_no} ${o.customer_name} 交期 ${o.delivery_date}`));
    content.push('');
  }
  if (overduePurchases.length > 0) {
    content.push('**🛒 超期采购:**');
    overduePurchases.forEach(p => content.push(`- 🔴 ${p.order_no} 预期 ${p.expected_date}`));
  }

  return { title: `⚠️ 超期 ${overdueOrders.length + overduePurchases.length} 单`, content: content.join('\n') };
}

// ==================== 钉钉回调接口 ====================

/**
 * 钉钉 Outgoing Webhook 回调
 * POST /api/bot/dingtalk
 */
router.post('/dingtalk', async (req, res) => {
  try {
    const { text, senderNick } = req.body;
    const content = text?.content;
    if (!content) return res.json({ msgtype: 'text', text: { content: '消息为空' } });

    // 可选：签名验证
    const timestamp = req.headers['timestamp'];
    const sign = req.headers['sign'];
    if (process.env.DINGTALK_OUTGOING_TOKEN && timestamp && sign) {
      const secret = process.env.DINGTALK_OUTGOING_TOKEN;
      const str = `${timestamp}\n${secret}`;
      const expectedSign = crypto.createHmac('sha256', secret).update(str).digest('base64');
      if (sign !== expectedSign) {
        return res.status(403).json({ msgtype: 'text', text: { content: '签名验证失败' } });
      }
    }

    console.log(`[bot/dingtalk] ${senderNick}: ${content}`);
    const result = await handleCommand(content, req.db);

    res.json({
      msgtype: 'markdown',
      markdown: {
        title: result.title,
        text: result.content
      }
    });
  } catch (error) {
    console.error('[bot/dingtalk] 处理失败:', error.message);
    res.json({ msgtype: 'text', text: { content: '查询失败，请稍后重试' } });
  }
});

/**
 * 企业微信回调（简化版，适用于自建应用消息回调）
 * POST /api/bot/wechat
 */
router.post('/wechat', async (req, res) => {
  try {
    const { Content, FromUserName } = req.body;
    if (!Content) return res.json({ msgtype: 'text', text: { content: '消息为空' } });

    console.log(`[bot/wechat] ${FromUserName}: ${Content}`);
    const result = await handleCommand(Content, req.db);

    res.json({
      msgtype: 'markdown',
      markdown: { content: result.content }
    });
  } catch (error) {
    console.error('[bot/wechat] 处理失败:', error.message);
    res.json({ msgtype: 'text', text: { content: '查询失败，请稍后重试' } });
  }
});

/**
 * 通用 HTTP 查询接口（可被任何机器人平台调用）
 * GET /api/bot/query?q=生产状态
 */
router.get('/query', async (req, res) => {
  try {
    const q = req.query.q || '帮助';
    const result = await handleCommand(q, req.db);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[bot/query] 查询失败:', error.message);
    res.status(500).json({ success: false, message: '查询失败' });
  }
});

// 导出查询函数供定时任务和长连接机器人使用
module.exports = { router, queryProductionSummary, handleCommand };
