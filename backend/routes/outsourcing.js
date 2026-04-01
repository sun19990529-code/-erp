const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
const { outsourcingCreate } = require('../validators/schemas');
const { writeLog } = require('./logs');
const { generateOrderNo } = require('../utils/order-number');
const { createPayable } = require('./finance');
const { safeInClause } = require('../utils/sql');

// 待处理委外任务（优化：批量查询代替嵌套循环）
router.get('/pending', requirePermission('outsourcing_view'), async (req, res) => {
  try {
    // 1. 批量查询所有未完成生产工单
    const productionOrders = await req.db.all(`
      SELECT po.*, p.name as product_name
      FROM production_orders po
      JOIN products p ON po.product_id = p.id
      WHERE po.status != 'completed'
    `);
    if (productionOrders.length === 0) return res.json({ success: true, data: [] });

    // 2. 批量查询所有委外工序配置
    const productIds = [...new Set(productionOrders.map(po => po.product_id))];
    const inProduct = safeInClause('pp.product_id', productIds);
    const outsourcedProcesses = await req.db.all(`
      SELECT pp.*, pr.name as process_name
      FROM product_processes pp
      JOIN processes pr ON pp.process_id = pr.id
      WHERE ${inProduct.clause}
        AND pp.is_outsourced = 1
      ORDER BY pp.sequence
    `, inProduct.params);

    // 3. 批量查询已完成工序记录和已存在的委外单
    const poIds = productionOrders.map(po => po.id);
    const inPo = safeInClause('production_order_id', poIds);
    const completedRecords = await req.db.all(`
      SELECT production_order_id, process_id
      FROM production_process_records
      WHERE ${inPo.clause}
        AND status = 'completed'
    `, inPo.params);
    const existingOutsourcing = await req.db.all(`
      SELECT production_order_id, process_id
      FROM outsourcing_orders
      WHERE ${inPo.clause}
        AND status IN ('pending', 'processing')
    `, inPo.params);

    // 4. 内存 join 过滤
    const completedSet = new Set(completedRecords.map(r => `${r.production_order_id}-${r.process_id}`));
    const existingSet = new Set(existingOutsourcing.map(r => `${r.production_order_id}-${r.process_id}`));

    const pendingList = [];
    productionOrders.forEach(po => {
      outsourcedProcesses
        .filter(pp => pp.product_id === po.product_id)
        .forEach(pp => {
          const key = `${po.id}-${pp.process_id}`;
          if (!completedSet.has(key) && !existingSet.has(key)) {
            pendingList.push({
              production_order_id: po.id, order_no: po.order_no,
              product_id: po.product_id, product_name: po.product_name,
              process_id: pp.process_id, process_name: pp.process_name,
              quantity: po.quantity, unit: po.unit,
            });
          }
        });
    });
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
    const items = await req.db.all(`SELECT oi.*, p.code, p.name, p.specification, p.unit FROM outsourcing_items oi JOIN products p ON oi.product_id = p.id WHERE oi.outsourcing_order_id = ?`, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('outsourcing_create'), validate(outsourcingCreate), async (req, res) => {
  try {
    const { supplier_id, production_order_id, process_id, items, expected_date, operator, remark } = req.body;
    const orderNo = generateOrderNo('WW');
    let totalAmount = 0;
    items.forEach(item => { totalAmount += item.quantity * (item.unit_price || 0); });
    
    let outsourcingId;
    await req.db.transaction(async () => {
      const result = await req.db.run(`INSERT INTO outsourcing_orders (order_no, supplier_id, production_order_id, process_id, total_amount, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNo, supplier_id, production_order_id, process_id || null, totalAmount, expected_date, operator, remark]);
      outsourcingId = result.lastInsertRowid;
      for (const item of items) {
        await req.db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [outsourcingId, item.product_id, item.quantity, item.unit_price || 0]);
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
    const batchNo = `${inboundNo}-${index + 1}`;
    await db.run('INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
      [inboundId, item.product_id, batchNo, item.returned_quantity || item.quantity, item.unit_price || 0]);
    const existing = await db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?',
      [warehouse.id, item.product_id, batchNo]);
    if (existing) {
      await db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [item.returned_quantity || item.quantity, existing.id]);
    } else {
      await db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)',
        [warehouse.id, item.product_id, batchNo, item.returned_quantity || item.quantity]);
    }
  }
}

/**
 * 委外完成 → 自动推进生产工序 / 触发完工入库
 */
async function advanceProductionProcess(db, outsourcing) {
  if (!outsourcing.production_order_id || !outsourcing.process_id) return;

  const production = await db.get('SELECT * FROM production_orders WHERE id = ?', [outsourcing.production_order_id]);
  if (!production || production.status === 'completed') return;

  const processRecord = await db.get('SELECT * FROM production_process_records WHERE production_order_id = ? AND process_id = ?',
    [production.id, outsourcing.process_id]);
  if (processRecord && processRecord.status !== 'completed') {
    await db.run(`UPDATE production_process_records SET status = 'completed', operator = '委外完成', end_time = CURRENT_TIMESTAMP, outsourcing_id = ? WHERE id = ?`,
      [outsourcing.id, processRecord.id]);
  }

  const productProcesses = await db.all(
    `SELECT pp.*, p.code as process_code, p.name as process_name FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`,
    [production.product_id]
  );
  const currentIndex = productProcesses.findIndex(pp => pp.process_id == outsourcing.process_id);
  if (currentIndex < 0) return;

  if (currentIndex < productProcesses.length - 1) {
    const nextProcess = productProcesses[currentIndex + 1];
    await db.run('UPDATE production_orders SET current_process = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextProcess.process_code, production.id]);
    if (nextProcess.is_outsourced === 1) {
      const existingNext = await db.get('SELECT * FROM outsourcing_orders WHERE production_order_id = ? AND process_id = ?',
        [production.id, nextProcess.process_id]);
      if (!existingNext) {
        const defaultSupplier = await db.get('SELECT id FROM suppliers LIMIT 1');
        if (defaultSupplier) {
          const wwNo = generateOrderNo('WW');
          const wwResult = await db.run(
            `INSERT INTO outsourcing_orders (order_no, supplier_id, production_order_id, process_id, total_amount, operator, remark, status) VALUES (?, ?, ?, ?, 0, '系统自动', ?, 'pending')`,
            [wwNo, defaultSupplier.id, production.id, nextProcess.process_id, `自动创建 - 工序: ${nextProcess.process_name}`]
          );
          await db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 0)',
            [wwResult.lastInsertRowid, production.product_id, production.quantity]);
        }
      }
    }
  } else {
    await handleProductionComplete(db, production, outsourcing.process_id);
  }

  if (production.order_id) {
    await updateOrderProgress(db, production.order_id, production.id);
  }
}

/**
 * 生产工单完成 → 成品自动入库
 */
async function handleProductionComplete(db, production, processId) {
  const currentProcessInfo = await db.get('SELECT * FROM processes WHERE id = ?', [processId]);
  await db.run('UPDATE production_orders SET current_process = ?, status = ?, end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [currentProcessInfo?.code || '', 'completed', production.id]);

  const existingInbound = await db.get(`SELECT * FROM inbound_orders WHERE production_order_id = ? AND type = 'finished'`, [production.id]);
  if (existingInbound) return;

  const finishedWarehouse = await db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1");
  if (!finishedWarehouse) return;

  const inNo = generateOrderNo('IN');
  const inResult = await db.run(
    `INSERT INTO inbound_orders (order_no, type, warehouse_id, production_order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, 0, '系统自动', ?, 'approved')`,
    [inNo, finishedWarehouse.id, production.id, `生产完成自动入库 - 生产工单: ${production.order_no}`]
  );
  await db.run(`INSERT INTO inbound_items (inbound_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 0)`,
    [inResult.lastInsertRowid, production.product_id, production.quantity]);

  const inv = await db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ?',
    [finishedWarehouse.id, production.product_id]);
  if (inv) {
    await db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [production.quantity, inv.id]);
  } else {
    await db.run('INSERT INTO inventory (warehouse_id, product_id, quantity) VALUES (?, ?, ?)',
      [finishedWarehouse.id, production.product_id, production.quantity]);
  }
}

/**
 * 更新订单整体进度
 */
async function updateOrderProgress(db, orderId, completedProductionId) {
  const productionOrders = await db.all('SELECT * FROM production_orders WHERE order_id = ?', [orderId]);
  if (productionOrders.length === 0) return;

  // 批量查询所有工单的工序总数和已完成工序数（消除 N+1）
  const poIds = productionOrders.map(po => po.id);
  const prodIds = [...new Set(productionOrders.map(po => po.product_id))];

  const inProd = safeInClause('pp.product_id', prodIds);
  const allProcessCounts = await db.all(
    `SELECT pp.product_id, COUNT(*) as total FROM product_processes pp WHERE ${inProd.clause} GROUP BY pp.product_id`,
    inProd.params
  );
  const processCountMap = Object.fromEntries(allProcessCounts.map(r => [r.product_id, r.total]));

  const inPo = safeInClause('ppr.production_order_id', poIds);
  const allCompletedCounts = await db.all(
    `SELECT ppr.production_order_id, COUNT(DISTINCT ppr.process_id) as done FROM production_process_records ppr WHERE ${inPo.clause} AND ppr.status = 'completed' GROUP BY ppr.production_order_id`,
    inPo.params
  );
  const completedCountMap = Object.fromEntries(allCompletedCounts.map(r => [r.production_order_id, r.done]));

  let totalProgress = 0;
  for (const po of productionOrders) {
    if (po.id === completedProductionId || po.status === 'completed') {
      totalProgress += 100;
    } else {
      const totalProc = processCountMap[po.product_id] || 0;
      const doneProc = completedCountMap[po.id] || 0;
      if (totalProc > 0) totalProgress += Math.round((doneProc / totalProc) * 100);
    }
  }
  const avgProgress = Math.round(totalProgress / productionOrders.length);
  const newStatus = avgProgress >= 100 ? 'completed' : avgProgress > 0 ? 'processing' : 'pending';
  await db.run('UPDATE orders SET progress = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [avgProgress, newStatus, orderId]);

  // 【修复】订单完成时自动创建成品出库单（与 production.js 逻辑一致）
  if (newStatus === 'completed') {
    const existingOutbound = await db.get(`SELECT * FROM outbound_orders WHERE order_id = ? AND type = 'finished'`, [orderId]);
    if (!existingOutbound) {
      const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
      const warehouse = await db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1");
      if (order && warehouse) {
        const orderItems = await db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        if (orderItems.length > 0) {
          // 检查库存是否充足
          let stockOk = true;
          for (const item of orderItems) {
            const inv = await db.get('SELECT SUM(quantity) as total FROM inventory WHERE warehouse_id = ? AND product_id = ?', [warehouse.id, item.product_id]);
            if (!inv || inv.total < item.quantity) { stockOk = false; break; }
          }
          if (stockOk) {
            const outNo = generateOrderNo('OUT');
            const outResult = await db.run(`INSERT INTO outbound_orders (order_no, type, warehouse_id, order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, 0, '系统自动', ?, 'approved')`,
              [outNo, warehouse.id, orderId, `订单完成自动出库 - 销售订单: ${order.order_no}`]);
            const outboundId = outResult.lastInsertRowid;
            for (const item of orderItems) {
              let remaining = item.quantity;
              const batches = await db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC', [warehouse.id, item.product_id]);
              for (const batch of batches) {
                if (remaining <= 0) break;
                const deduct = Math.min(remaining, batch.quantity);
                await db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
                await db.run(`INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`, [outboundId, item.product_id, batch.batch_no, deduct, item.unit_price || 0]);
                remaining -= deduct;
              }
            }
          }
        }
      }
    }
  }
}


// ==================== 路由 ====================

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
        await advanceProductionProcess(req.db, outsourcing);
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
    const { supplier_id, production_order_id, process_id, expected_date, operator, remark, items } = req.body;
    await req.db.transaction(async () => {
      await req.db.run('UPDATE outsourcing_orders SET supplier_id = ?, production_order_id = ?, process_id = ?, expected_date = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [supplier_id, production_order_id || null, process_id || null, expected_date, operator, remark, req.params.id]);
      await req.db.run('DELETE FROM outsourcing_items WHERE outsourcing_order_id = ?', [req.params.id]);
      for (const item of items) {
        await req.db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price, remark) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, item.quantity, item.unit_price || 0, item.remark]);
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
