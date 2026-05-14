const { BusinessError } = require('../utils/BusinessError');
const { generateOrderNo } = require('../utils/order-number');
const { ENTITY_STATUS } = require('../constants/status');
const Decimal = require('decimal.js');
const { sendNotification } = require('../routes/notifications');

// 模块级仓库ID缓存（仓库主数据几乎不变动，避免每次报工都查表）
let _warehouseCache = null;
let _warehouseCacheTime = 0;
const WAREHOUSE_CACHE_TTL = 5 * 60 * 1000; // 5分钟

class ProductionService {

  static async getWarehouseIds(db) {
    const now = Date.now();
    if (_warehouseCache && (now - _warehouseCacheTime) < WAREHOUSE_CACHE_TTL) {
      return _warehouseCache;
    }
    const [semi, finished] = await Promise.all([
      db.get("SELECT id FROM warehouses WHERE type = 'semi' LIMIT 1"),
      db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1")
    ]);
    _warehouseCache = { semiId: semi?.id || null, finishedId: finished?.id || null };
    _warehouseCacheTime = now;
    return _warehouseCache;
  }

  static async generatePlannedConsumption(db, productionId, productId, quantity) {
    try {
      // 查询工序及工序绑定的物料(BOM展开)
      const materials = await db.all(`
        SELECT pp.process_id, pm.material_id, pm.quantity as unit_qty, pm.unit 
        FROM product_processes pp 
        JOIN process_materials pm ON pm.product_process_id = pp.id 
        WHERE pp.product_id = ?
      `, [productId]);

      for (const m of materials) {
        const plannedQty = (parseFloat(m.unit_qty) || 0) * (parseFloat(quantity) || 0);
        await db.run(`
          INSERT INTO production_material_consumption 
          (production_order_id, process_id, material_id, planned_quantity, actual_quantity, unit) 
          VALUES (?, ?, ?, ?, 0, ?)
        `, [productionId, m.process_id, m.material_id, plannedQty, m.unit]);
      }
    } catch (e) {
      console.error('[ProductionService.generatePlannedConsumption]', e.message);
    }
  }
  
  
  static async createOutsourcingOrderForProcess(db, production, processInfo, quantity) {
    const existing = await db.get(`SELECT * FROM outsourcing_orders WHERE production_order_id = ? AND process_id = ?`, [production.id, processInfo.process_id]);
    if (existing) return existing;
    const defaultSupplier = await db.get("SELECT id FROM suppliers WHERE status = ? ORDER BY id LIMIT 1", [ENTITY_STATUS.ACTIVE]) || await db.get('SELECT id FROM suppliers LIMIT 1');
    if (!defaultSupplier) { console.warn('[production] 无可用供应商，无法自动创建委外单'); return null; }
    const orderNo = generateOrderNo('WW');
    const result = await db.run(`
      INSERT INTO outsourcing_orders
        (order_no, supplier_id, production_order_id, process_id, total_amount, operator, remark, status)
      VALUES (?, ?, ?, ?, 0, '系统自动', ?, 'pending')
    `, [orderNo, defaultSupplier.id, production.id, processInfo.process_id, `自动创建 - 工序: ${processInfo.process_name}`]);
    const orderId = result.lastInsertRowid;
    await db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 0)', [orderId, production.product_id, quantity || production.quantity]);
    return { id: orderId, order_no: orderNo, process_id: processInfo.process_id, process_name: processInfo.process_name };
  }

  static async createFinishedProductInbound(db, production, quantity) {
    const { finishedId } = await ProductionService.getWarehouseIds(db);
    if (!finishedId) return null;
    const warehouse = { id: finishedId };
    const orderNo = generateOrderNo('IN');
    
    // ======== 成本归集 (Cost Rollup) ========
    // 1. 领料成本 (通过 products.unit_price 作为标准成本)
    const materialCostRow = await db.get(`
      SELECT COALESCE(SUM(
        CASE WHEN pk.type = 'return' THEN -pi.quantity * COALESCE(p.unit_price, 0)
             ELSE pi.quantity * COALESCE(p.unit_price, 0) END
      ), 0) as total_material_cost
      FROM pick_items pi
      JOIN pick_orders pk ON pi.pick_order_id = pk.id
      JOIN products p ON pi.material_id = p.id
      WHERE pk.production_order_id = ? AND pk.status = 'completed'
    `, [production.id]);
    const totalMaterialCost = parseFloat(materialCostRow.total_material_cost || 0);

    // 2. 委外成本
    const outsourceCostRow = await db.get(`
      SELECT COALESCE(SUM(total_amount), 0) as total_outsourcing_cost
      FROM outsourcing_orders
      WHERE production_order_id = ? AND status = 'completed'
    `, [production.id]);
    const totalOutsourcingCost = parseFloat(outsourceCostRow.total_outsourcing_cost || 0);

    // 3. 计算单位成本
    const totalCost = totalMaterialCost + totalOutsourcingCost;
    const unitPrice = quantity > 0 ? (totalCost / quantity).toFixed(4) : 0;

    const result = await db.run(`INSERT INTO inbound_orders (order_no, type, warehouse_id, production_order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, ?, '系统自动', ?, 'approved')`,
      [orderNo, warehouse.id, production.id, totalCost, `生产完成自动入库 - 生产工单: ${production.order_no}`]);
    const inboundId = result.lastInsertRowid;
    const batchNo = `PRD-${production.order_no}`;
    await db.run(`INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`, [inboundId, production.product_id, batchNo, quantity, unitPrice]);
    const inventory = await db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [warehouse.id, production.product_id, batchNo]);
    if (inventory) {
      await db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [quantity, inventory.id]);
    } else {
      await db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [warehouse.id, production.product_id, batchNo, quantity]);
    }
    return { id: inboundId, order_no: orderNo };
  }

  static async updateOrderProgress(db, orderId) {
    const productionOrders = await db.all('SELECT * FROM production_orders WHERE order_id = ?', [orderId]);
    if (productionOrders.length === 0) return;
  
    const prodIds = [...new Set(productionOrders.map(po => po.product_id))];
    const prodPh = prodIds.map(() => '?').join(',');
    // 查每个产品有几道工序
    const allProcessCounts = await db.all(
      `SELECT product_id, COUNT(*) as total FROM product_processes WHERE product_id IN (${prodPh}) GROUP BY product_id`, prodIds
    );
    const processCountMap = Object.fromEntries(allProcessCounts.map(r => [r.product_id, r.total]));

    // 查每个产品的工序列表（用于逐工序计算产出比）
    const allProcesses = await db.all(
      `SELECT pp.product_id, pr.code as process_code FROM product_processes pp JOIN processes pr ON pp.process_id = pr.id WHERE pp.product_id IN (${prodPh}) ORDER BY pp.sequence`, prodIds
    );

    const poIds = productionOrders.map(po => po.id);
    const poPh = poIds.map(() => '?').join(',');
    // 查每个工单每道工序的累计产出
    const allOutputs = await db.all(
      `SELECT ppr.production_order_id, pr.code as process_code, COALESCE(SUM(ppr.output_quantity), 0) as output
       FROM production_process_records ppr JOIN processes pr ON ppr.process_id = pr.id
       WHERE ppr.production_order_id IN (${poPh}) AND ppr.status = 'completed'
       GROUP BY ppr.production_order_id, pr.code`, poIds
    );
    const outputMap = {};
    allOutputs.forEach(r => {
      if (!outputMap[r.production_order_id]) outputMap[r.production_order_id] = {};
      outputMap[r.production_order_id][r.process_code] = parseFloat(r.output) || 0;
    });

    let totalProgress = new Decimal(0);
    for (const po of productionOrders) {
      if (po.status === 'completed') {
        totalProgress = totalProgress.plus(100);
      } else {
        const ppList = allProcesses.filter(pp => pp.product_id === po.product_id);
        const poOutputs = outputMap[po.id] || {};
        const target = po.quantity || 0;
        if (ppList.length > 0 && target > 0) {
          let weightedSum = new Decimal(0);
          for (const pp of ppList) {
            const out = poOutputs[pp.process_code] || 0;
            weightedSum = weightedSum.plus(Decimal.min(new Decimal(out).div(target), 1));
          }
          totalProgress = totalProgress.plus(weightedSum.div(ppList.length).times(100));
        }
      }
    }
    const avgProgress = totalProgress.div(productionOrders.length).toDecimalPlaces(0).toNumber();
    const newStatus = avgProgress >= 100 ? 'completed' : avgProgress > 0 ? 'processing' : 'pending';
    await db.run('UPDATE orders SET progress = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [avgProgress, newStatus, orderId]);
    if (newStatus === 'completed') { await ProductionService.createFinishedProductOutbound(db, orderId); }
  }

  static async createFinishedProductOutbound(db, orderId) {
    const existing = await db.get(`SELECT * FROM outbound_orders WHERE order_id = ? AND type = 'finished'`, [orderId]);
    if (existing) return existing;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return null;
    const warehouse = await db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1");
    if (!warehouse) return null;
    const orderItems = await db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    if (orderItems.length === 0) return null;
    
    // N+1 Optimization 
    const prodIds = [...new Set(orderItems.map(item => item.product_id))];
    const prodPh = prodIds.map(() => '?').join(',');
    const invRecords = await db.all(`SELECT product_id, SUM(quantity) as total FROM inventory WHERE warehouse_id = ? AND product_id IN (${prodPh}) GROUP BY product_id`, [warehouse.id, ...prodIds]);
    const invMap = Object.fromEntries(invRecords.map(r => [r.product_id, r.total]));

    for (const item of orderItems) {
      const remainingQty = item.quantity - (item.shipped_quantity || 0);
      if (remainingQty <= 0) continue;
      const invTotal = invMap[item.product_id] || 0;
      if (invTotal < remainingQty) {
        return { pending: true, message: `成品库存不足，请入库后手动创建出库单` };
      }
    }
    
    const orderNo = generateOrderNo('OUT');
    const result = await db.run(`INSERT INTO outbound_orders (order_no, type, warehouse_id, order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, 0, '系统自动', ?, 'approved')`,
      [orderNo, warehouse.id, orderId, `订单完成自动出库 - 销售订单: ${order.order_no}`]);
    const outboundId = result.lastInsertRowid;
    for (const item of orderItems) {
      let remaining = item.quantity - (item.shipped_quantity || 0);
      if (remaining <= 0) continue;
      const batches = await db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC FOR UPDATE', [warehouse.id, item.product_id]);
      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity);
        await db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
        await db.run(`INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`, [outboundId, item.product_id, batch.batch_no, deduct, item.unit_price || 0]);
        remaining -= deduct;
      }
    }
    return { id: outboundId, order_no: orderNo };
  }

  static async submitProcessReport(db, productionId, params) {
    const { process_id, operator, input_quantity, output_quantity, defect_quantity, remark, outsourcing_id, force, parameter_data } = params;
    let responseData = { success: true };
    
    const production = await db.get('SELECT * FROM production_orders WHERE id = ? FOR UPDATE', [productionId]);
    if (!production) throw new BusinessError('该工单不存在');

    const productProcesses = await db.all(`SELECT pp.*, p.code as process_code, p.name as process_name FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [production.product_id]);
    const currentProcess = await db.get('SELECT * FROM processes WHERE id = ?', [process_id]);
    const currentIndex = productProcesses.findIndex(pp => pp.process_id == process_id);
    
    const historyTotal = await db.get('SELECT COALESCE(SUM(input_quantity), 0) as total_input, COALESCE(SUM(output_quantity), 0) as total_output, COALESCE(SUM(defect_quantity), 0) as total_defect FROM production_process_records WHERE production_order_id = ? AND process_id = ? AND status = ?', [productionId, process_id, 'completed']);
    
    const inQty = Number(input_quantity) || 0;
    const outQty = Number(output_quantity) || 0;
    const defQty = Number(defect_quantity) || 0;
    
    const willTotalOutput = Number(historyTotal.total_output || 0) + outQty;
    const willTotalDefect = Number(historyTotal.total_defect || 0) + defQty;
    
    if (currentIndex > 0) {
      const prevProcess = productProcesses[currentIndex - 1];
      const prevProcessTotal = await db.get('SELECT COALESCE(SUM(output_quantity), 0) as total_output FROM production_process_records WHERE production_order_id = ? AND process_id = ? AND status = ?', [productionId, prevProcess.process_id, 'completed']);
      const prevTotalOut = Number(prevProcessTotal.total_output || 0);
      if ((willTotalOutput + willTotalDefect) > prevTotalOut) {
        throw new BusinessError(`越界拦截：前置工序[${prevProcess.process_name}]累计产出为 ${prevTotalOut}，本次报工后总产出将达 ${willTotalOutput + willTotalDefect}，已超限！请核对报工数量。`);
      }
    } else {
      const willTotalInput = Number(historyTotal.total_input || 0) + inQty;
      if ((willTotalOutput + willTotalDefect) > willTotalInput) {
        throw new BusinessError(`越界拦截：首道工序本次报工后总产出(${willTotalOutput + willTotalDefect})将超过总投入数量(${willTotalInput})！`);
      }
    }
    
    await db.run(`INSERT INTO production_process_records (production_order_id, process_id, operator, input_quantity, output_quantity, defect_quantity, status, start_time, end_time, remark, outsourcing_id, parameter_data) VALUES (?, ?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)`,
      [productionId, process_id, operator, input_quantity, output_quantity, defect_quantity, remark, outsourcing_id || null, parameter_data ? JSON.stringify(parameter_data) : null]);
    
    const cumulativeOutput = willTotalOutput;
    
    if (currentIndex === 0) {
      if (!force) {
        const completedPick = await db.get(
          "SELECT id FROM pick_orders WHERE production_order_id = ? AND type = 'pick' AND status = 'completed' LIMIT 1",
          [productionId]
        );
        if (!completedPick) {
          const warnMsg = '发生无单耗料报工：该工单尚未完成系统领料，但车间已产生首道工序报工';
          sendNotification(db, null, 'warning', '车间无单耗料预警', warnMsg, 'production', productionId).catch(e => console.error(e));
        }
      }

      const pickedTotal = await db.get(
        `SELECT COALESCE(SUM(pi.quantity), 0) as total_picked
         FROM pick_items pi
         JOIN pick_orders pk ON pi.pick_order_id = pk.id
         WHERE pk.production_order_id = ? AND pk.type = 'pick' AND pk.status = 'completed'`,
        [productionId]
      );
      const totalPicked = pickedTotal?.total_picked || 0;
      const willTotalInput = (historyTotal.total_input || 0) + (input_quantity || 0);
      if (totalPicked > 0 && willTotalInput > totalPicked) {
        throw new BusinessError(`投入量超限：已领料 ${totalPicked}，累计投入将达 ${willTotalInput}，超出已领材料数量！`);
      }

      const pickedMaterials = await db.all(
        `SELECT pi.material_id, p.name as material_name, p.code as material_code, p.unit,
                p.outer_diameter, p.wall_thickness, p.length as material_length,
                SUM(pi.quantity) as picked_quantity, pi.batch_no, pi.supplier_batch_no, pi.heat_no
         FROM pick_items pi
         JOIN pick_orders pk ON pi.pick_order_id = pk.id
         JOIN products p ON pi.material_id = p.id
         WHERE pk.production_order_id = ? AND pk.type = 'pick' AND pk.status = 'completed'
         GROUP BY pi.material_id, p.name, p.code, p.unit, p.outer_diameter, p.wall_thickness, p.length, pi.batch_no, pi.supplier_batch_no, pi.heat_no`,
        [productionId]
      );
      responseData.pickedMaterials = pickedMaterials;
      responseData.totalPicked = totalPicked;
    }
    
    const targetQty = production.quantity;
    let outsourcingOrder = null;
    
    if (production.status === 'pending') {
      await db.run('UPDATE production_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['processing', productionId]);
    }
    
    const totalCompleted = await db.get('SELECT COALESCE(SUM(output_quantity), 0) as total FROM production_process_records WHERE production_order_id = ? AND process_id = (SELECT process_id FROM product_processes WHERE product_id = ? ORDER BY sequence DESC LIMIT 1)', [productionId, production.product_id]);
    await db.run('UPDATE production_orders SET completed_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [totalCompleted?.total || 0, productionId]);
    
    const currentPP = productProcesses[currentIndex];
    const actualOutput = output_quantity || 0;
    const { semiId, finishedId } = await ProductionService.getWarehouseIds(db);
    const semiWarehouse = semiId ? { id: semiId } : null;
    const finishedWarehouse = finishedId ? { id: finishedId } : null;
    
    if (currentIndex > 0 && actualOutput > 0) {
      const prevPP = productProcesses[currentIndex - 1];
      if (prevPP.output_product_id && semiWarehouse) {
        const batches = await db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC FOR UPDATE', [semiWarehouse.id, prevPP.output_product_id]);
        let available = 0;
        for (const row of batches) available += row.quantity;
        
        if (available < actualOutput) {
          const prevProduct = await db.get('SELECT name FROM products WHERE id = ?', [prevPP.output_product_id]);
          throw new BusinessError(`半成品「${prevProduct?.name || prevPP.output_product_id}」库存不足！需要 ${actualOutput}，当前 ${available}`);
        }
        
        let remaining = actualOutput;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, batch.quantity);
          await db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
          remaining -= deduct;
        }
      }
    }
    
    if (currentPP.output_product_id && actualOutput > 0) {
      const isLastProcess = currentIndex === productProcesses.length - 1;
      let targetWarehouse;
      if (isLastProcess) {
        targetWarehouse = finishedWarehouse;
      } else if (currentPP.output_product_id === production.product_id) {
        targetWarehouse = semiWarehouse;
      } else {
        targetWarehouse = semiWarehouse;
      }
      if (targetWarehouse) {
        const batchNo = `PRD-${production.order_no}`;
        const existingInv = await db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [targetWarehouse.id, currentPP.output_product_id, batchNo]);
        if (existingInv) {
          await db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [actualOutput, existingInv.id]);
        } else {
          await db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [targetWarehouse.id, currentPP.output_product_id, batchNo, actualOutput]);
        }
        responseData.semiProductInbound = {
          product_id: currentPP.output_product_id,
          quantity: actualOutput,
          warehouse_type: isLastProcess ? 'finished' : 'semi'
        };
      }
    }
    
    if (cumulativeOutput >= targetQty) {
      if (currentIndex < productProcesses.length - 1) {
        const nextProcess = productProcesses[currentIndex + 1];
        await db.run('UPDATE production_orders SET current_process = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextProcess.process_code, productionId]);
        if (nextProcess.is_outsourced === 1) {
          outsourcingOrder = await ProductionService.createOutsourcingOrderForProcess(db, production, nextProcess, cumulativeOutput);
        }
      } else {
        await db.run('UPDATE production_orders SET current_process = ?, status = ?, completed_quantity = ?, end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [currentProcess.code, 'completed', cumulativeOutput, productionId]);
        if (!currentPP.output_product_id) {
          const inboundOrder = await ProductionService.createFinishedProductInbound(db, production, cumulativeOutput);
          responseData.inboundOrder = inboundOrder;
        }
        if (production.order_id) { await ProductionService.updateOrderProgress(db, production.order_id); }
      }
    }
    
    responseData.processProgress = {
      cumulative_output: cumulativeOutput,
      target_quantity: targetQty,
      remaining: Math.max(0, targetQty - cumulativeOutput),
      is_completed: cumulativeOutput >= targetQty
    };
    responseData.outsourcingOrder = outsourcingOrder;

    return responseData;
  }

  // ==================== 智能防呆自动切片派发 (Bulk Dispatch) ====================
  static async bulkDispatch(db, user, data) {
    const { order_id, product_id, total_quantity, batch_capacity, operator, remark, start_time, end_time } = data;
    
    // 参数严防校验
    if (!total_quantity || !batch_capacity || batch_capacity <= 0 || total_quantity <= 0) {
      throw new BusinessError('无效的拆包或总数参数。');
    }

    // 【防呆】检验销售订单剩余可派发产出量（防超发）
    if (order_id) {
      const orderItem = await db.get('SELECT quantity FROM order_items WHERE order_id = ? AND product_id = ?', [order_id, product_id]);
      if (orderItem) {
        const relatedOrders = await db.all("SELECT status, quantity, completed_quantity FROM production_orders WHERE order_id = ? AND product_id = ? AND status != 'cancelled'", [order_id, product_id]);
        let consumed = 0;
        for (const po of relatedOrders) {
          if (po.status === 'completed') consumed += (po.completed_quantity || 0);
          else consumed += (po.quantity || 0);
        }
        const remaining = orderItem.quantity - consumed;
        if (total_quantity > remaining) {
          throw new BusinessError(`总拆包数已超发！订单剩需 ${Math.max(0, remaining)} 件，但您试图自动切割下发 ${total_quantity} 件。`);
        }
      }
    }

    // 智能数理切割: eg. 100 拆 30 -> [30, 30, 30, 10]
    const chunks = [];
    let rem = total_quantity;
    while (rem > 0) {
      chunks.push(Math.min(batch_capacity, rem));
      rem -= batch_capacity;
    }

    const baseOrderNo = generateOrderNo('PO');
    let generatedCount = 0;
    
    // 开启高并发大事务：一旦中途有一单挂了，全盘回档！
    // 注意：如果在事务外调用此函数，外层需要包裹事务。如果在 controller 中调用，已自带事务（如果封装好的话）。
    // 此处由 dbHelper 自动支持嵌套事务。
    await db.transaction(async () => {
      const productProcesses = await db.all(`SELECT pp.*, p.code as process_code FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [product_id]);
      
      for (let i = 0; i < chunks.length; i++) {
        const qty = chunks[i];
        const subOrderNo = `${baseOrderNo}-${i + 1}`;
        
        const result = await db.run(`INSERT INTO production_orders (order_no, order_id, product_id, quantity, operator, remark, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [subOrderNo, order_id || null, product_id, qty, operator || null, `【智能切包 批次${i+1}/${chunks.length}】${remark || ''}`, start_time || null, end_time || null]);
        
        const productionId = result.lastInsertRowid;
        
        if (productProcesses.length > 0) {
          // 优化 N+1 循环插入
          const placeholders = productProcesses.map(() => '(?, ?, ?)').join(', ');
          const params = productProcesses.flatMap(pp => [productionId, pp.process_id, 'pending']);
          await db.run(`INSERT INTO production_process_records (production_order_id, process_id, status) VALUES ${placeholders}`, params);
          
          await db.run('UPDATE production_orders SET current_process = ? WHERE id = ?', [productProcesses[0].process_code, productionId]);
        }
        
        await ProductionService.generatePlannedConsumption(db, productionId, product_id, qty);
        
        // 由于这里需要 writeLog，但 writeLog 并非全局挂载，如果缺少，需要注意依赖引入。
        // 为了解耦，这里只执行业务层操作。
        generatedCount++;
      }
    });

    return { success: true, message: `兵贵神速！已凭借智能算法将总量 ${total_quantity} 一把划分为 ${generatedCount} 个单独流水单流转！` };
  }

  // ==================== 异常分流引擎 (Split & Scrap) ====================
  static async splitAndScrap(db, user, parentId, data) {
    const { split_quantity, split_type, target_process_code, reason, process_sequence } = data;
    if (!split_quantity || split_quantity <= 0) throw new BusinessError('剥离数量必须大于0');
    if (!['REWORK', 'SCRAP'].includes(split_type)) throw new BusinessError('无效的分流类型');

    const production = await db.get('SELECT * FROM production_orders WHERE id = ?', [parentId]);
    if (!production) throw new BusinessError('母工单不存在');

    // 严苛防超发校验
    const remaining = (production.quantity || 0) - (production.completed_quantity || 0);
    if (split_quantity > remaining) {
      throw new BusinessError(`母工单剩余未完成数量(${remaining})不足以支撑拆分(${split_quantity})`);
    }

    const suffix = split_type === 'REWORK' ? `-R${process_sequence || 1}` : `-S${process_sequence || 1}`;
    const newOrderNo = `${production.order_no}${suffix}`;
    const newBatchNo = production.batch_no ? `${production.batch_no}${suffix}` : null;
    
    let newProductionId;
    await db.transaction(async () => {
      // 1. 扣减母单
      await db.run('UPDATE production_orders SET quantity = quantity - ? WHERE id = ?', [split_quantity, parentId]);

      // 2. 衍生子单
      const status = split_type === 'SCRAP' ? 'scrapped' : 'pending';
      const current_process = split_type === 'SCRAP' ? null : target_process_code;
      
      const insertResult = await db.run(`
        INSERT INTO production_orders 
        (order_no, order_id, product_id, batch_no, quantity, current_process, status, remark, parent_id, split_reason, original_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [newOrderNo, production.order_id, production.product_id, newBatchNo, split_quantity, current_process, status, 
          `由主单[${production.order_no}]剥离。原因: ${reason || '无'}`, parentId, reason, split_quantity]);
      
      newProductionId = insertResult.lastInsertRowid;

      // 3. 报废分支
      if (split_type === 'SCRAP') {
        const scrapWhConfig = await db.get("SELECT value FROM system_settings WHERE key = 'scrap_warehouse_id'");
        let scrapWh = null;
        if (scrapWhConfig && scrapWhConfig.value) {
          scrapWh = await db.get("SELECT id FROM warehouses WHERE id = ?", [scrapWhConfig.value]);
        }
        if (!scrapWh) {
          scrapWh = await db.get("SELECT id FROM warehouses WHERE code = 'WH-SCRAP'");
        }
        
        if (scrapWh) {
          const inboundNo = 'IN' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);
          const ibRes = await db.run(`
            INSERT INTO inbound_orders (order_no, type, warehouse_id, operator, status, remark, production_order_id)
            VALUES (?, 'scrap', ?, ?, 'pending_inspection', '批次分裂：差值分流(等待仓管员实物过磅入库)', ?)
          `, [inboundNo, user?.username || 'SplitEngine', newProductionId]);
          
          await db.run(`
            INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, remark)
            VALUES (?, ?, ?, ?, ?)
          `, [ibRes.lastInsertRowid, production.product_id, newBatchNo || 'DEFAULT', split_quantity, '拆批报废损耗入库']);
        }
      }

      // 4. 返工分支
      if (split_type === 'REWORK') {
        const productProcesses = await db.all(`
          SELECT pp.*, p.code as process_code, p.name as process_name
          FROM product_processes pp JOIN processes p ON pp.process_id = p.id
          WHERE pp.product_id = ? ORDER BY pp.sequence
        `, [production.product_id]);
        
        const targetIndex = productProcesses.findIndex(pp => pp.process_code === target_process_code);
        if (targetIndex !== -1) {
          const pendingProcesses = productProcesses.slice(targetIndex);
          if (pendingProcesses.length > 0) {
            const placeholders = pendingProcesses.map(() => '(?, ?, ?, ?)').join(', ');
            const params = pendingProcesses.flatMap((pp, idx) => [
              newProductionId, 
              pp.process_id, 
              'pending', 
              idx === 0 ? `自动跳站返工(${reason})` : '随动待加工'
            ]);
            await db.run(`INSERT INTO production_process_records (production_order_id, process_id, status, remark) VALUES ${placeholders}`, params);
          }
        }
      }

      await ProductionService.generatePlannedConsumption(db, newProductionId, production.product_id, split_quantity);
    });

    return { success: true, message: `成功拆分并生成子工单 ${newOrderNo}`, data: { newOrderNo } };
  }

  // ==================== 返工流程 (Rework) ====================
  static async reworkOrder(db, user, orderId, data) {
    const { target_process_id, quantity, reason, operator } = data;

    const production = await db.get('SELECT * FROM production_orders WHERE id = ?', [orderId]);
    if (!production) throw new BusinessError('工单不存在');

    if (!['quality_hold', 'completed'].includes(production.status)) {
      throw new BusinessError('只有质检暂停或已完成（客户退回）的工单才能发起返工');
    }

    const productProcesses = await db.all(
      `SELECT pp.*, p.code as process_code, p.name as process_name
       FROM product_processes pp JOIN processes p ON pp.process_id = p.id
       WHERE pp.product_id = ? ORDER BY pp.sequence`, [production.product_id]);
    const targetIndex = productProcesses.findIndex(pp => pp.process_id == target_process_id);
    if (targetIndex === -1) throw new BusinessError('目标工序不属于该产品的工序配置');

    const targetProcess = productProcesses[targetIndex];
    const reworkQty = quantity || production.quantity;

    await db.transaction(async () => {
      await db.run(
        'UPDATE production_orders SET current_process = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [targetProcess.process_code, 'processing', orderId]);

      const pendingProcesses = productProcesses.slice(targetIndex);
      if (pendingProcesses.length > 0) {
        const placeholders = pendingProcesses.map(() => '(?, ?, ?, ?)').join(', ');
        const params = pendingProcesses.flatMap((pp, idx) => [
          orderId, 
          pp.process_id, 
          'pending', 
          idx === 0 ? `返工(${reason})` : '返工待重做'
        ]);
        await db.run(`INSERT INTO production_process_records (production_order_id, process_id, status, remark) VALUES ${placeholders}`, params);
      }
    });

    return { success: true, message: `已回退到工序「${targetProcess.process_name}」，请安排车间重新报工` };
  }
}

module.exports = ProductionService;
