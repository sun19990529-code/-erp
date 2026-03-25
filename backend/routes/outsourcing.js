const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
const { outsourcingCreate } = require('../validators/schemas');
const { writeLog } = require('./logs');
const { generateOrderNo } = require('../utils/order-number');

// 待处理委外任务（优化：批量查询代替嵌套循环）
router.get('/pending', requirePermission('outsourcing_view'), (req, res) => {
  try {
    // 1. 批量查询所有未完成生产工单
    const productionOrders = req.db.all(`
      SELECT po.*, p.name as product_name
      FROM production_orders po
      JOIN products p ON po.product_id = p.id
      WHERE po.status != 'completed'
    `);
    if (productionOrders.length === 0) return res.json({ success: true, data: [] });

    // 2. 批量查询所有委外工序配置
    const productIds = [...new Set(productionOrders.map(po => po.product_id))];
    const outsourcedProcesses = req.db.all(`
      SELECT pp.*, pr.name as process_name
      FROM product_processes pp
      JOIN processes pr ON pp.process_id = pr.id
      WHERE pp.product_id IN (${productIds.map(() => '?').join(',')})
        AND pp.is_outsourced = 1
      ORDER BY pp.sequence
    `, productIds);

    // 3. 批量查询已完成工序记录和已存在的委外单
    const poIds = productionOrders.map(po => po.id);
    const completedRecords = req.db.all(`
      SELECT production_order_id, process_id
      FROM production_process_records
      WHERE production_order_id IN (${poIds.map(() => '?').join(',')})
        AND status = 'completed'
    `, poIds);
    const existingOutsourcing = req.db.all(`
      SELECT production_order_id, process_id
      FROM outsourcing_orders
      WHERE production_order_id IN (${poIds.map(() => '?').join(',')})
        AND status IN ('pending', 'processing')
    `, poIds);

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

router.get('/', requirePermission('outsourcing_view'), (req, res) => {
  try {
    const { status, supplier_id, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT oo.*, s.name as supplier_name, po.order_no as production_order_no, pr.name as process_name FROM outsourcing_orders oo JOIN suppliers s ON oo.supplier_id = s.id LEFT JOIN production_orders po ON oo.production_order_id = po.id LEFT JOIN processes pr ON oo.process_id = pr.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND oo.status = ?'; params.push(status); }
    if (supplier_id) { sql += ' AND oo.supplier_id = ?'; params.push(supplier_id); }
    sql += ' ORDER BY oo.created_at DESC';
    const result = req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id', validateId, requirePermission('outsourcing_view'), (req, res) => {
  try {
    const order = req.db.get(`SELECT oo.*, s.name as supplier_name, po.order_no as production_order_no FROM outsourcing_orders oo JOIN suppliers s ON oo.supplier_id = s.id LEFT JOIN production_orders po ON oo.production_order_id = po.id WHERE oo.id = ?`, [req.params.id]);
    const items = req.db.all(`SELECT oi.*, p.code, p.name, p.specification, p.unit FROM outsourcing_items oi JOIN products p ON oi.product_id = p.id WHERE oi.outsourcing_order_id = ?`, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('outsourcing_create'), validate(outsourcingCreate), (req, res) => {
  try {
    const { supplier_id, production_order_id, process_id, items, expected_date, operator, remark } = req.body;
    const orderNo = generateOrderNo('WW');
    let totalAmount = 0;
    items.forEach(item => { totalAmount += item.quantity * (item.unit_price || 0); });
    
    let outsourcingId;
    req.db.transaction(() => {
      const result = req.db.run(`INSERT INTO outsourcing_orders (order_no, supplier_id, production_order_id, process_id, total_amount, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNo, supplier_id, production_order_id, process_id || null, totalAmount, expected_date, operator, remark]);
      outsourcingId = result.lastInsertRowid;
      items.forEach(item => {
        req.db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [outsourcingId, item.product_id, item.quantity, item.unit_price || 0]);
      });
    });
    res.json({ success: true, data: { id: outsourcingId, order_no: orderNo } });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/status', validateId, requirePermission('outsourcing_edit'), (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验
    const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'received', 'inspection_passed', 'inspection_failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    
    req.db.transaction(() => {
      const outsourcing = req.db.get(`SELECT oo.*, s.name as supplier_name FROM outsourcing_orders oo LEFT JOIN suppliers s ON oo.supplier_id = s.id WHERE oo.id = ?`, [req.params.id]);
      // 【防重复】只有从非完成状态变为 completed/received 时才执行入库联动
      const alreadyProcessed = outsourcing && (outsourcing.status === 'completed' || outsourcing.status === 'received');
      if ((status === 'completed' || status === 'received') && !alreadyProcessed) {
        const items = req.db.all('SELECT * FROM outsourcing_items WHERE outsourcing_order_id = ?', [req.params.id]);
        if (items.length > 0) {
          const warehouse = req.db.get("SELECT id FROM warehouses WHERE type = 'semi' LIMIT 1");
          if (warehouse) {
            const inboundNo = generateOrderNo('IN');
            let totalAmount = 0;
            items.forEach(item => { totalAmount += (item.quantity || 0) * (item.unit_price || 0); });
            const inboundResult = req.db.run(`INSERT INTO inbound_orders (order_no, type, warehouse_id, supplier_id, total_amount, operator, remark, status) VALUES (?, 'semi', ?, ?, ?, ?, ?, 'approved')`,
              [inboundNo, warehouse.id, outsourcing.supplier_id, totalAmount, '委外入库', `委外单: ${outsourcing.order_no}`]);
            const inboundId = inboundResult.lastInsertRowid;
            items.forEach((item, index) => {
              const batchNo = `${inboundNo}-${index + 1}`;
              req.db.run('INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)', [inboundId, item.product_id, batchNo, item.returned_quantity || item.quantity, item.unit_price || 0]);
              const existing = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [warehouse.id, item.product_id, batchNo]);
              if (existing) { req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.returned_quantity || item.quantity, existing.id]); }
              else { req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [warehouse.id, item.product_id, batchNo, item.returned_quantity || item.quantity]); }
            });
          }
        }
        
        // 【联动#1】委外完成后自动推进生产工序
        if (outsourcing && outsourcing.production_order_id && outsourcing.process_id) {
          const production = req.db.get('SELECT * FROM production_orders WHERE id = ?', [outsourcing.production_order_id]);
          if (production && production.status !== 'completed') {
            // 标记该工序为完成
            const processRecord = req.db.get('SELECT * FROM production_process_records WHERE production_order_id = ? AND process_id = ?',
              [production.id, outsourcing.process_id]);
            if (processRecord && processRecord.status !== 'completed') {
              req.db.run(`UPDATE production_process_records SET status = 'completed', operator = '委外完成', end_time = CURRENT_TIMESTAMP, outsourcing_id = ? WHERE id = ?`,
                [req.params.id, processRecord.id]);
            }
            // 推进到下一个工序
            const productProcesses = req.db.all(`SELECT pp.*, p.code as process_code, p.name as process_name FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [production.product_id]);
            const currentIndex = productProcesses.findIndex(pp => pp.process_id == outsourcing.process_id);
            if (currentIndex >= 0 && currentIndex < productProcesses.length - 1) {
              // 还有下一道工序
              const nextProcess = productProcesses[currentIndex + 1];
              req.db.run('UPDATE production_orders SET current_process = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [nextProcess.process_code, production.id]);
              // 如果下一道也是委外，自动创建委外单
              if (nextProcess.is_outsourced === 1) {
                const existingNext = req.db.get('SELECT * FROM outsourcing_orders WHERE production_order_id = ? AND process_id = ?', [production.id, nextProcess.process_id]);
                if (!existingNext) {
                  const defaultSupplier = req.db.get('SELECT id FROM suppliers LIMIT 1');
                  if (defaultSupplier) {
                    const wwNo = generateOrderNo('WW');
                    const wwResult = req.db.run(`INSERT INTO outsourcing_orders (order_no, supplier_id, production_order_id, process_id, total_amount, operator, remark, status) VALUES (?, ?, ?, ?, 0, '系统自动', ?, 'pending')`,
                      [wwNo, defaultSupplier.id, production.id, nextProcess.process_id, `自动创建 - 工序: ${nextProcess.process_name}`]);
                    req.db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 0)',
                      [wwResult.lastInsertRowid, production.product_id, production.quantity]);
                  }
                }
              }
            } else if (currentIndex === productProcesses.length - 1) {
              // 最后一道工序完成，触发生产完成链
              const currentProcessInfo = req.db.get('SELECT * FROM processes WHERE id = ?', [outsourcing.process_id]);
              req.db.run('UPDATE production_orders SET current_process = ?, status = ?, end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [currentProcessInfo?.code || '', 'completed', production.id]);
              // 自动创建成品入库单
              const existingInbound = req.db.get(`SELECT * FROM inbound_orders WHERE production_order_id = ? AND type = 'finished'`, [production.id]);
              if (!existingInbound) {
                const finishedWarehouse = req.db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1");
                if (finishedWarehouse) {
                  const inNo = generateOrderNo('IN');
                  const inResult = req.db.run(`INSERT INTO inbound_orders (order_no, type, warehouse_id, production_order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, 0, '系统自动', ?, 'approved')`,
                    [inNo, finishedWarehouse.id, production.id, `生产完成自动入库 - 生产工单: ${production.order_no}`]);
                  req.db.run(`INSERT INTO inbound_items (inbound_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 0)`, [inResult.lastInsertRowid, production.product_id, production.quantity]);
                  const inv = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ?', [finishedWarehouse.id, production.product_id]);
                  if (inv) { req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [production.quantity, inv.id]); }
                  else { req.db.run('INSERT INTO inventory (warehouse_id, product_id, quantity) VALUES (?, ?, ?)', [finishedWarehouse.id, production.product_id, production.quantity]); }
                }
              }
              // 更新订单进度
              if (production.order_id) {
                const productionOrders = req.db.all('SELECT * FROM production_orders WHERE order_id = ?', [production.order_id]);
                let totalProgress = 0;
                productionOrders.forEach(po => {
                  if (po.id === production.id || po.status === 'completed') { totalProgress += 100; }
                  else {
                    const pp = req.db.all(`SELECT pp.id FROM product_processes pp WHERE pp.product_id = ?`, [po.product_id]);
                    const cp = req.db.all(`SELECT ppr.process_id FROM production_process_records ppr WHERE ppr.production_order_id = ? AND ppr.status = 'completed'`, [po.id]);
                    if (pp.length > 0) totalProgress += Math.round((cp.length / pp.length) * 100);
                  }
                });
                const avgProgress = Math.round(totalProgress / productionOrders.length);
                let newStatus = avgProgress >= 100 ? 'completed' : avgProgress > 0 ? 'processing' : 'pending';
                req.db.run('UPDATE orders SET progress = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [avgProgress, newStatus, production.order_id]);
              }
            }
          }
        }
      }
      req.db.run('UPDATE outsourcing_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    });
    writeLog(req.db, req.user?.id, '委外状态变更', 'outsourcing', req.params.id, `状态: ${status}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', validateId, requirePermission('outsourcing_edit'), (req, res) => {
  try {
    const { supplier_id, production_order_id, process_id, expected_date, operator, remark, items } = req.body;
    req.db.transaction(() => {
      req.db.run('UPDATE outsourcing_orders SET supplier_id = ?, production_order_id = ?, process_id = ?, expected_date = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [supplier_id, production_order_id || null, process_id || null, expected_date, operator, remark, req.params.id]);
      req.db.run('DELETE FROM outsourcing_items WHERE outsourcing_order_id = ?', [req.params.id]);
      items.forEach(item => {
        req.db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price, remark) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, item.quantity, item.unit_price || 0, item.remark]);
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', validateId, requirePermission('outsourcing_delete'), (req, res) => {
  try {
    const order = req.db.get('SELECT * FROM outsourcing_orders WHERE id = ?', [req.params.id]);
    if (order && order.status !== 'pending') return res.status(400).json({ success: false, message: '只能删除待处理状态的委外单' });
    req.db.transaction(() => {
      // 清理关联的检验记录（防止外键约束失败）
      req.db.run('DELETE FROM outsourcing_inspections WHERE outsourcing_id = ?', [req.params.id]);
      // 清理工序记录中的委外引用
      req.db.run('UPDATE production_process_records SET outsourcing_id = NULL WHERE outsourcing_id = ?', [req.params.id]);
      req.db.run('DELETE FROM outsourcing_items WHERE outsourcing_order_id = ?', [req.params.id]);
      req.db.run('DELETE FROM outsourcing_orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[outsourcing.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
