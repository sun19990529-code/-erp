const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
const { outsourcingCreate } = require('../validators/schemas');
const { writeLog } = require('./logs');
const { generateOrderNo } = require('../utils/order-number');
const { createPayable } = require('./finance');
const { safeInClause } = require('../utils/sql');
const ProductionService = require('../services/ProductionService');

// 待处理委外任务（只展示前置工序已完成的委外工序）
router.get('/pending', requirePermission('outsourcing_view'), async (req, res) => {
  try {
    // [Phase 1 性能优化] 使用 PostgreSQL 查询优化：更精准的状态机比对
    // 只有当工单当前的流转指针 (current_process) 刚好走到这道委外工序时，才允许加入此待委外列表。
    const pendingList = await req.db.all(`
      WITH 
      active_pos AS (
        SELECT po.id as production_order_id, po.order_no, po.product_id, po.quantity, po.current_process,
               p.name as product_name, p.code as product_code, p.specification, p.unit
        FROM production_orders po
        JOIN products p ON po.product_id = p.id
        WHERE po.status IN ('pending', 'processing')
      ),
      -- 取出所有含有明细进度产出的记录，来过滤掉这道工序本身已经通过报工（或已有总产出）的条目
      process_outputs AS (
        SELECT production_order_id, process_id, COALESCE(SUM(output_quantity), 0) as total_output
        FROM production_process_records
        GROUP BY production_order_id, process_id
      )
      
      SELECT 
        po.production_order_id,
        po.order_no,
        po.product_id,
        po.product_name,
        po.product_code,
        po.specification,
        po.quantity,
        po.unit,
        pp.process_id,
        pr.name as process_name
      FROM active_pos po
      JOIN product_processes pp ON po.product_id = pp.product_id AND pp.is_outsourced = 1
      JOIN processes pr ON pp.process_id = pr.id
      -- 当前工序状态判定
      LEFT JOIN process_outputs out_current 
             ON out_current.production_order_id = po.production_order_id 
            AND out_current.process_id = pp.process_id
      WHERE 
        -- 核心防御：只有在这张工单当前流转工序刚好就是本委外工序时，才给列出
        po.current_process = pr.code
        -- 必须没有产出（没完工）
        AND COALESCE(out_current.total_output, 0) = 0
        -- 排除已经被创建委外单锁定的记录
        AND NOT EXISTS (
          SELECT 1 FROM outsourcing_items oi
          JOIN outsourcing_orders oo ON oi.outsourcing_order_id = oo.id
          WHERE oi.production_order_id = po.production_order_id 
            AND oi.process_id = pp.process_id 
            AND oo.status IN ('pending', 'confirmed', 'processing')
        )
        -- 兼容 v1.0 时代旧数据
        AND NOT EXISTS (
          SELECT 1 FROM outsourcing_orders oo
          WHERE oo.production_order_id = po.production_order_id 
            AND oo.process_id = pp.process_id 
            AND oo.status IN ('pending', 'confirmed', 'processing')
        )
      ORDER BY po.production_order_id DESC, pp.sequence ASC;
    `);

    res.json({ success: true, data: pendingList });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/', requirePermission('outsourcing_view'), async (req, res) => {
  try {
    const { status, supplier_id, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT oo.*, s.name as supplier_name, po.order_no as production_order_no, pr.name as process_name FROM outsourcing_orders oo JOIN suppliers s ON oo.supplier_id = s.id LEFT JOIN production_orders po ON oo.production_order_id = po.id LEFT JOIN processes pr ON oo.process_id = pr.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND oo.status = ?'; params.push(status); }
    if (supplier_id) { sql += ' AND oo.supplier_id = ?'; params.push(supplier_id); }
    sql += ' ORDER BY oo.created_at DESC';
    const result = await req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id', validateId, requirePermission('outsourcing_view'), async (req, res) => {
  try {
    const order = await req.db.get(`SELECT oo.*, s.name as supplier_name, po.order_no as production_order_no FROM outsourcing_orders oo JOIN suppliers s ON oo.supplier_id = s.id LEFT JOIN production_orders po ON oo.production_order_id = po.id WHERE oo.id = ?`, [req.params.id]);
    const items = await req.db.all(`
      SELECT oi.*, p.code, p.name, p.specification, p.unit,
             ppo.order_no as production_order_no, pr.name as process_name
      FROM outsourcing_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN production_orders ppo ON oi.production_order_id = ppo.id
      LEFT JOIN processes pr ON oi.process_id = pr.id
      WHERE oi.outsourcing_order_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 创建委外单（支持合批：items 中每条可携带不同的 production_order_id/process_id）
router.post('/', requirePermission('outsourcing_create'), async (req, res) => {
  try {
    const { supplier_id, items, expected_date, operator, remark } = req.body;
    if (!supplier_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: '供应商和加工明细不能为空' });
    }

    const orderNo = generateOrderNo('WW');
    let totalAmount = 0;
    items.forEach(item => { totalAmount += (item.quantity || 0) * (item.unit_price || 0); });

    // 向后兼容：如果所有明细来自同一个工单/工序，也记录到 orders 表顶层
    const uniquePo = [...new Set(items.filter(i => i.production_order_id).map(i => i.production_order_id))];
    const uniqueProc = [...new Set(items.filter(i => i.process_id).map(i => i.process_id))];
    const topLevelPoId = uniquePo.length === 1 ? uniquePo[0] : null;
    const topLevelProcId = uniqueProc.length === 1 ? uniqueProc[0] : null;

    let outsourcingId;
    await req.db.transaction(async () => {
      const result = await req.db.run(`INSERT INTO outsourcing_orders (order_no, supplier_id, production_order_id, process_id, total_amount, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNo, supplier_id, topLevelPoId, topLevelProcId, totalAmount, expected_date, operator, remark]);
      outsourcingId = result.lastInsertRowid;
      for (const item of items) {
        await req.db.run(
          'INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price, production_order_id, process_id, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [outsourcingId, item.product_id, item.quantity, item.unit_price || 0, item.production_order_id || null, item.process_id || null, item.remark || null]
        );
      }
    });
    res.json({ success: true, data: { id: outsourcingId, order_no: orderNo } });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 辅助函数 ====================

/**
 * 委外完成 → 自动创建入库单并更新库存
 */
async function handleOutsourcingInbound(db, outsourcing, items) {
  const warehouse = await db.get("SELECT id FROM warehouses WHERE type = 'semi' LIMIT 1");
  if (!warehouse || items.length === 0) return;

  const inboundNo = generateOrderNo('IN');
  let totalAmount = 0;
  items.forEach(item => { totalAmount += (item.quantity || 0) * (item.unit_price || 0); });

  const inboundResult = await db.run(
    `INSERT INTO inbound_orders (order_no, type, warehouse_id, supplier_id, total_amount, operator, remark, status) VALUES (?, 'semi', ?, ?, ?, ?, ?, 'approved')`,
    [inboundNo, warehouse.id, outsourcing.supplier_id, totalAmount, '委外入库', `委外单: ${outsourcing.order_no}`]
  );
  const inboundId = inboundResult.lastInsertRowid;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const qty = item.received_quantity || item.quantity;
    const batchNo = `${inboundNo}-${index + 1}`;
    await db.run('INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
      [inboundId, item.product_id, batchNo, qty, item.unit_price || 0]);
    const existing = await db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?',
      [warehouse.id, item.product_id, batchNo]);
    if (existing) {
      await db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [qty, existing.id]);
    } else {
      await db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)',
        [warehouse.id, item.product_id, batchNo, qty]);
    }
  }
}

/**
 * 委外完成 → 按明细逐条推进生产工序 / 触发完工入库
 * 复用 ProductionService 中的成品入库和订单进度更新逻辑
 */
async function advanceProductionProcessByItems(db, outsourcing, items) {
  // 按工单分组明细
  const groupByPo = {};
  items.forEach(item => {
    const poId = item.production_order_id;
    const procId = item.process_id;
    if (!poId || !procId) return;
    const key = `${poId}-${procId}`;
    if (!groupByPo[key]) groupByPo[key] = { production_order_id: poId, process_id: procId, totalQty: 0 };
    groupByPo[key].totalQty += (item.received_quantity || item.quantity || 0);
  });

  // 兼容旧数据：如果明细上没有 production_order_id，fallback 到订单级
  if (Object.keys(groupByPo).length === 0 && outsourcing.production_order_id && outsourcing.process_id) {
    const key = `${outsourcing.production_order_id}-${outsourcing.process_id}`;
    groupByPo[key] = { production_order_id: outsourcing.production_order_id, process_id: outsourcing.process_id, totalQty: 0 };
    items.forEach(item => { groupByPo[key].totalQty += (item.received_quantity || item.quantity || 0); });
  }

  for (const entry of Object.values(groupByPo)) {
    const production = await db.get('SELECT * FROM production_orders WHERE id = ?', [entry.production_order_id]);
    if (!production || production.status === 'completed') continue;

    const processRecord = await db.get('SELECT * FROM production_process_records WHERE production_order_id = ? AND process_id = ?',
      [production.id, entry.process_id]);
    if (processRecord && processRecord.status !== 'completed') {
      await db.run(`UPDATE production_process_records SET status = 'completed', operator = '委外完成', end_time = CURRENT_TIMESTAMP, outsourcing_id = ? WHERE id = ?`,
        [outsourcing.id, processRecord.id]);
    }

    const productProcesses = await db.all(
      `SELECT pp.*, p.code as process_code, p.name as process_name FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`,
      [production.product_id]
    );
    const currentIndex = productProcesses.findIndex(pp => pp.process_id == entry.process_id);
    if (currentIndex < 0) continue;

    if (currentIndex < productProcesses.length - 1) {
      const nextProcess = productProcesses[currentIndex + 1];
      await db.run('UPDATE production_orders SET current_process = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [nextProcess.process_code, production.id]);
      if (nextProcess.is_outsourced === 1) {
        await ProductionService.createOutsourcingOrderForProcess(db, production, nextProcess, entry.totalQty || production.quantity);
      }
    } else {
      const currentProcessInfo = await db.get('SELECT * FROM processes WHERE id = ?', [entry.process_id]);
      await db.run('UPDATE production_orders SET current_process = ?, status = ?, end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [currentProcessInfo?.code || '', 'completed', production.id]);
      const existingInbound = await db.get(`SELECT * FROM inbound_orders WHERE production_order_id = ? AND type = 'finished'`, [production.id]);
      if (!existingInbound) {
        await ProductionService.createFinishedProductInbound(db, production, entry.totalQty || production.quantity);
      }
    }

    if (production.order_id) {
      await ProductionService.updateOrderProgress(db, production.order_id);
    }
  }
}


// ==================== 路由 ====================

// 部分收货
router.put('/:id/receive', validateId, requirePermission('outsourcing_edit'), async (req, res) => {
  try {
    const { items: receivedItems } = req.body;
    if (!receivedItems || receivedItems.length === 0) {
      return res.status(400).json({ success: false, message: '收货明细不能为空' });
    }

    await req.db.transaction(async () => {
      const outsourcing = await req.db.get(`SELECT oo.*, s.name as supplier_name FROM outsourcing_orders oo LEFT JOIN suppliers s ON oo.supplier_id = s.id WHERE oo.id = ?`, [req.params.id]);
      if (!outsourcing) return res.status(404).json({ success: false, message: '委外单不存在' });

      // 更新每行明细的 received_quantity
      for (const ri of receivedItems) {
        if (ri.id && ri.received_quantity > 0) {
          await req.db.run('UPDATE outsourcing_items SET received_quantity = COALESCE(received_quantity, 0) + ? WHERE id = ?',
            [ri.received_quantity, ri.id]);
        }
      }

      // 查询更新后的明细
      const allItems = await req.db.all('SELECT * FROM outsourcing_items WHERE outsourcing_order_id = ?', [req.params.id]);
      const allReceived = allItems.every(item => (item.received_quantity || 0) >= item.quantity);

      // 入库处理（仅入库本次收货的部分）
      const itemsToInbound = [];
      for (const ri of receivedItems) {
        const fullItem = allItems.find(i => i.id === ri.id);
        if (fullItem && ri.received_quantity > 0) {
          itemsToInbound.push({ ...fullItem, received_quantity: ri.received_quantity });
        }
      }
      if (itemsToInbound.length > 0) {
        await handleOutsourcingInbound(req.db, outsourcing, itemsToInbound.map(i => ({ ...i, quantity: i.received_quantity })));
      }

      // 如果全部收完，推进工序 + 更新状态
      if (allReceived) {
        await advanceProductionProcessByItems(req.db, outsourcing, allItems);
        await req.db.run('UPDATE outsourcing_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['received', req.params.id]);
        // 财务联动
        await createPayable(req.db, {
          type: '委外应付',
          sourceType: 'outsourcing',
          sourceId: req.params.id,
          supplierId: outsourcing.supplier_id,
          amount: outsourcing.total_amount || 0,
          remark: `委外单 ${outsourcing.order_no} 自动生成`
        });
      } else {
        // 部分收货 → 标记为 processing
        if (outsourcing.status === 'pending' || outsourcing.status === 'confirmed') {
          await req.db.run('UPDATE outsourcing_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['processing', req.params.id]);
        }
      }
    });

    writeLog(req.db, req.user?.id, '委外收货', 'outsourcing', req.params.id, `部分/全部收货`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/status', validateId, requirePermission('outsourcing_edit'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'received', 'inspection_passed', 'inspection_failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    
    await req.db.transaction(async () => {
      const outsourcing = await req.db.get(`SELECT oo.*, s.name as supplier_name FROM outsourcing_orders oo LEFT JOIN suppliers s ON oo.supplier_id = s.id WHERE oo.id = ?`, [req.params.id]);
      const alreadyProcessed = outsourcing && (outsourcing.status === 'completed' || outsourcing.status === 'received');

      if ((status === 'completed' || status === 'received') && !alreadyProcessed) {
        const items = await req.db.all('SELECT * FROM outsourcing_items WHERE outsourcing_order_id = ?', [req.params.id]);
        await handleOutsourcingInbound(req.db, outsourcing, items);
        await advanceProductionProcessByItems(req.db, outsourcing, items);
      }

      await req.db.run('UPDATE outsourcing_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);

      // 【财务联动】委外完成时自动生成应付账款
      if ((status === 'completed' || status === 'received') && !alreadyProcessed && outsourcing) {
        await createPayable(req.db, {
          type: '委外应付',
          sourceType: 'outsourcing',
          sourceId: req.params.id,
          supplierId: outsourcing.supplier_id,
          amount: outsourcing.total_amount || 0,
          remark: `委外单 ${outsourcing.order_no} 自动生成`
        });
      }
    });
    writeLog(req.db, req.user?.id, '委外状态变更', 'outsourcing', req.params.id, `状态: ${status}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', validateId, requirePermission('outsourcing_edit'), async (req, res) => {
  try {
    const { supplier_id, expected_date, operator, remark, items } = req.body;
    let totalAmount = 0;
    (items || []).forEach(item => { totalAmount += (item.quantity || 0) * (item.unit_price || 0); });

    // 向后兼容顶层字段
    const uniquePo = [...new Set((items || []).filter(i => i.production_order_id).map(i => i.production_order_id))];
    const uniqueProc = [...new Set((items || []).filter(i => i.process_id).map(i => i.process_id))];
    const topLevelPoId = uniquePo.length === 1 ? uniquePo[0] : null;
    const topLevelProcId = uniqueProc.length === 1 ? uniqueProc[0] : null;

    await req.db.transaction(async () => {
      await req.db.run('UPDATE outsourcing_orders SET supplier_id = ?, production_order_id = ?, process_id = ?, expected_date = ?, operator = ?, remark = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [supplier_id, topLevelPoId, topLevelProcId, expected_date, operator, remark, totalAmount, req.params.id]);
      await req.db.run('DELETE FROM outsourcing_items WHERE outsourcing_order_id = ?', [req.params.id]);
      for (const item of items) {
        await req.db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price, production_order_id, process_id, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, item.quantity, item.unit_price || 0, item.production_order_id || null, item.process_id || null, item.remark || null]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', validateId, requirePermission('outsourcing_delete'), async (req, res) => {
  try {
    const order = await req.db.get('SELECT * FROM outsourcing_orders WHERE id = ?', [req.params.id]);
    if (order && order.status !== 'pending') return res.status(400).json({ success: false, message: '只能删除待处理状态的委外单' });
    await req.db.transaction(async () => {
      // 清理关联的检验记录（防止外键约束失败）
      await req.db.run('DELETE FROM outsourcing_inspections WHERE outsourcing_id = ?', [req.params.id]);
      // 清理工序记录中的委外引用
      await req.db.run('UPDATE production_process_records SET outsourcing_id = NULL WHERE outsourcing_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM outsourcing_items WHERE outsourcing_order_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM outsourcing_orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
