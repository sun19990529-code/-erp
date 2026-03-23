const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { generateOrderNo } = require('../utils/order-number');
const { writeLog } = require('./logs');

// 入库检验
router.get('/inbound', requirePermission('inspection_view'), (req, res) => {
  try {
    const inspections = req.db.all(`
      SELECT ii.*, io.order_no as inbound_order_no, p.name as product_name, p.code as product_code
      FROM inbound_inspections ii
      LEFT JOIN inbound_orders io ON ii.inbound_id = io.id
      LEFT JOIN products p ON ii.product_id = p.id
      ORDER BY ii.created_at DESC
    `);
    res.json({ success: true, data: inspections });
  } catch (error) {
    console.error(`[inspection.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/inbound', requirePermission('inspection_create'), (req, res) => {
  try {
    const { inbound_order_id, product_id, quantity, result: inspResult, inspector, remark, defect_quantity, defect_type, pass_quantity, fail_quantity } = req.body;
    const inspNo = generateOrderNo('IBI');
    
    req.db.transaction(() => {
      req.db.run(`
        INSERT INTO inbound_inspections (inspection_no, inbound_id, product_id, quantity, result, inspector, remark, pass_quantity, fail_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [inspNo, inbound_order_id, product_id, quantity, inspResult, inspector, remark,
          pass_quantity ?? (inspResult === 'pass' ? quantity : 0), fail_quantity ?? defect_quantity ?? 0]);
      
      if (inspResult === 'pass') {
        // 【联动#2修复】检验通过只更新入库单状态，不直接修改库存
        const allItems = req.db.all('SELECT * FROM inbound_items WHERE inbound_id = ?', [inbound_order_id]);
        const allInspected = allItems.every(item => {
          const insp = req.db.get('SELECT * FROM inbound_inspections WHERE inbound_id = ? AND product_id = ? AND result = ?', [inbound_order_id, item.product_id, 'pass']);
          return !!insp;
        });
        if (allInspected) {
          const order = req.db.get('SELECT * FROM inbound_orders WHERE id = ?', [inbound_order_id]);
          // 检查是否已经入过库，防止重复入库
          const alreadyStocked = order && (order.status === 'completed' || order.status === 'approved');
          if (!alreadyStocked) {
            // 同步执行库存增加（与 warehouse.js PUT /inbound/:id/status 逻辑一致）
            allItems.forEach(item => {
              const batch = item.batch_no || 'DEFAULT_BATCH';
              const existing = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [order.warehouse_id, item.product_id, batch]);
              if (existing) {
                req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, existing.id]);
              } else {
                req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [order.warehouse_id, item.product_id, batch, item.quantity]);
              }
            });
          }
          req.db.run("UPDATE inbound_orders SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [inbound_order_id]);
        }
      } else if (inspResult === 'fail') {
        req.db.run("UPDATE inbound_orders SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [inbound_order_id]);
      }
    });
    writeLog(req.db, req.user?.id, '入库检验', 'inspection', inbound_order_id, `检验结果: ${inspResult}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[inspection.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 巡检
router.get('/patrol', requirePermission('inspection_view'), (req, res) => {
  try {
    const inspections = req.db.all(`
      SELECT pi.*, po.order_no as production_order_no, pr.name as process_name, p.name as product_name
      FROM patrol_inspections pi
      LEFT JOIN production_orders po ON pi.production_order_id = po.id
      LEFT JOIN processes pr ON pi.process_id = pr.id
      LEFT JOIN products p ON pi.product_id = p.id
      ORDER BY pi.created_at DESC
    `);
    res.json({ success: true, data: inspections });
  } catch (error) {
    console.error(`[inspection.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/patrol', requirePermission('inspection_create'), (req, res) => {
  try {
    const { production_order_id, process_id, product_id, result: inspResult, inspector, remark, defect_quantity, defect_type } = req.body;
    const inspNo = generateOrderNo('IPT');
    req.db.transaction(() => {
      req.db.run(`
        INSERT INTO patrol_inspections (inspection_no, production_order_id, process_id, product_id, result, inspector, remark, defect_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [inspNo, production_order_id, process_id, product_id, inspResult, inspector, remark, defect_quantity || 0]);
      
      // 【联动#7】巡检不合格时标记生产工单为质检暂停
      if (inspResult === 'fail' && production_order_id) {
        req.db.run("UPDATE production_orders SET status = 'quality_hold', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing'",
          [production_order_id]);
      }
    });
    writeLog(req.db, req.user?.id, '生产巡检', 'inspection', production_order_id, `检验结果: ${inspResult}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[inspection.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 委外加工检验
router.get('/outsourcing', requirePermission('inspection_view'), (req, res) => {
  try {
    const inspections = req.db.all(`
      SELECT oi.*, oo.order_no as outsourcing_order_no, p.name as product_name, p.code as product_code, s.name as supplier_name
      FROM outsourcing_inspections oi
      LEFT JOIN outsourcing_orders oo ON oi.outsourcing_id = oo.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN suppliers s ON oo.supplier_id = s.id
      ORDER BY oi.created_at DESC
    `);
    res.json({ success: true, data: inspections });
  } catch (error) {
    console.error(`[inspection.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/outsourcing', requirePermission('inspection_create'), (req, res) => {
  try {
    const { outsourcing_order_id, product_id, quantity, result: inspResult, inspector, remark, defect_quantity, defect_type } = req.body;
    const inspNo = generateOrderNo('IOS');
    
    req.db.transaction(() => {
      req.db.run(`
        INSERT INTO outsourcing_inspections (inspection_no, outsourcing_id, product_id, quantity, result, inspector, remark, pass_quantity, fail_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [inspNo, outsourcing_order_id, product_id, quantity, inspResult, inspector, remark,
          inspResult === 'pass' ? quantity : 0, defect_quantity || 0]);
      
      if (inspResult === 'pass') {
        // 检验通过：更新为 inspection_passed 状态
        // 用户需在委外管理模块手动确认"完成"，以触发完整的入库+工序推进联动
        req.db.run("UPDATE outsourcing_orders SET status = 'inspection_passed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [outsourcing_order_id]);
      } else if (inspResult === 'fail') {
        req.db.run("UPDATE outsourcing_orders SET status = 'inspection_failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [outsourcing_order_id]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[inspection.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 成品检验
router.get('/final', requirePermission('inspection_view'), (req, res) => {
  try {
    const inspections = req.db.all(`
      SELECT fi.*, po.order_no as production_order_no, p.name as product_name, p.code as product_code
      FROM final_inspections fi
      LEFT JOIN production_orders po ON fi.production_order_id = po.id
      LEFT JOIN products p ON fi.product_id = p.id
      ORDER BY fi.created_at DESC
    `);
    res.json({ success: true, data: inspections });
  } catch (error) {
    console.error(`[inspection.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/final', requirePermission('inspection_create'), (req, res) => {
  try {
    const { production_order_id, product_id, quantity, result: inspResult, inspector, remark, defect_quantity, defect_type } = req.body;
    const inspNo = generateOrderNo('IFN');
    
    req.db.transaction(() => {
      req.db.run(`
        INSERT INTO final_inspections (inspection_no, production_order_id, product_id, quantity, result, inspector, remark, pass_quantity, fail_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [inspNo, production_order_id, product_id, quantity, inspResult, inspector, remark,
          inspResult === 'pass' ? quantity : 0, defect_quantity || 0]);
      
      // 【修复#3】不再重复操作 completed_quantity（该值已由报工完成时设定）
      // 成品检验只做通过/不通过的记录
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[inspection.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
