/**
 * fix_all_pages.js
 * Rebuilds all page files by extracting components from App.jsx using
 * accurate line numbers, avoiding the overreach bug in the original script.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'frontend', 'src');
// Read the CURRENT App.jsx (the new 135-line thin router version)
// We need the original component code - but App.jsx is now the new thin version.
// The components were written to the pages/* files already, but some are contaminated.
// Strategy: re-read from existing page files and strip contamination.

// Instead, we'll read each page file and find the real "end" of each component.

const write = (rel, txt) => {
  const fp = path.join(srcDir, rel);
  fs.writeFileSync(fp, txt, 'utf8');
  const lines = txt.split('\n').length;
  console.log('  Written:', rel, '(' + lines + ' lines)');
};

// Helper: given a file content, find the TRUE end of a top-level component named 'name'
// by tracking brace depth starting from where 'const name =' appears.
function extractComponent(content, name) {
  const lines = content.split('\n');
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(new RegExp(`^const ${name} = `))) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) return null;
  
  // Track depth to find end
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let endLine = startLine;
  
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (inString) {
        if (c === stringChar && line[j-1] !== '\\') inString = false;
      } else {
        if (c === '"' || c === "'" || c === '`') { inString = true; stringChar = c; }
        else if (c === '{' || c === '(') depth++;
        else if (c === '}' || c === ')') {
          depth--;
          if (depth === 0 && i > startLine) {
            // Check if next char or end of line is ';'
            const rest = line.substring(j + 1).trim();
            if (rest === ';' || rest === '' || rest.startsWith('//') || rest.startsWith(';')) {
              endLine = i;
              return lines.slice(startLine, endLine + 1).join('\n');
            }
          }
        }
      }
    }
    // For arrow functions that end with }; on own line
    if (i > startLine && (line === '};' || line === ');')) {
      endLine = i;
      return lines.slice(startLine, endLine + 1).join('\n');
    }
  }
  return lines.slice(startLine).join('\n');
}

// Common page imports
const PI = `import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import SearchFilter from '../components/SearchFilter';
import SearchSelect, { SimpleSearchSelect } from '../components/SearchSelect';
import Table from '../components/Table';
import { TableSkeleton, Skeleton } from '../components/Skeleton';
import { useDraftForm } from '../hooks/useDraftForm';
import SimpleCRUDManager from '../components/SimpleCRUDManager';`;

// ==================== Fix BasicDataPages.jsx ====================
{
  const raw = fs.readFileSync(path.join(srcDir, 'pages/BasicDataPages.jsx'), 'utf8');
  const supplier = extractComponent(raw, 'SupplierManager');
  const customer = extractComponent(raw, 'CustomerManager');
  const department = extractComponent(raw, 'DepartmentManager');
  const product = extractComponent(raw, 'ProductManager');
  
  if (!supplier || !customer || !department || !product) {
    console.error('BasicDataPages: missing components!', 
      { supplier: !!supplier, customer: !!customer, department: !!department, product: !!product });
  } else {
    write('pages/BasicDataPages.jsx', `${PI}
import PrintableQRCode from '../components/PrintableQRCode';

${supplier}

${customer}

${department}

${product}

export { SupplierManager, CustomerManager, DepartmentManager, ProductManager };
`);
  }
}

// ==================== Fix useDraftForm.js ====================
{
  const raw = fs.readFileSync(path.join(srcDir, 'hooks/useDraftForm.js'), 'utf8');
  const draft = extractComponent(raw, 'useDraftForm');
  if (draft) {
    // Strip everything after the useDraftForm function
    write('hooks/useDraftForm.js', `import { useState, useCallback } from 'react';

${draft}

export { useDraftForm };
`);
  }
}

// ==================== Fix other potentially contaminated page files ====================
// Re-check each pages file for contamination and clean
const pageFiles = [
  'WarehousePages.jsx',
  'OrderPages.jsx', 
  'ProductionPages.jsx',
  'ProcessPages.jsx',
  'InspectionPages.jsx',
  'PurchasePages.jsx',
  'OutsourcingPages.jsx',
  'UserPages.jsx',
  'SettingsPages.jsx',
  'Dashboard.jsx',
  'Sidebar.jsx',
];

// Component names per file
const fileComponents = {
  'WarehousePages.jsx': ['InventoryView', 'WarehouseOrderManager'],
  'OrderPages.jsx': ['OrderManager'],
  'ProductionPages.jsx': ['PickMaterialManager', 'ProductionOrderManager', 'ProductionScheduleGantt'],
  'ProcessPages.jsx': ['ProcessConfigManager', 'ProcessManager'],
  'InspectionPages.jsx': ['InboundInspection', 'PatrolInspection', 'OutsourcingInspection', 'FinalInspection'],
  'PurchasePages.jsx': ['PurchaseManager'],
  'OutsourcingPages.jsx': ['OutsourcingManager'],
  'UserPages.jsx': ['RoleManager', 'PermissionManager', 'UserManager'],
  'SettingsPages.jsx': ['BackupSettings', 'AboutSystem'],
};

const fileExports = {
  'WarehousePages.jsx': 'export { InventoryView, WarehouseOrderManager };',
  'OrderPages.jsx': 'export { OrderManager };',
  'ProductionPages.jsx': 'export { PickMaterialManager, ProductionOrderManager, ProductionScheduleGantt };',
  'ProcessPages.jsx': 'export { ProcessConfigManager, ProcessManager };',
  'InspectionPages.jsx': 'export { InboundInspection, PatrolInspection, OutsourcingInspection, FinalInspection };',
  'PurchasePages.jsx': 'export { PurchaseManager };',
  'OutsourcingPages.jsx': 'export { OutsourcingManager };',
  'UserPages.jsx': 'export { RoleManager, PermissionManager, UserManager };',
  'SettingsPages.jsx': 'export { BackupSettings, AboutSystem };',
};

const fileExtraImports = {
  'OrderPages.jsx': "import PrintableQRCode from '../components/PrintableQRCode';",
  'InspectionPages.jsx': "import PrintableQRCode from '../components/PrintableQRCode';",
  'ProductionPages.jsx': '',
};

Object.entries(fileComponents).forEach(([filename, comps]) => {
  const fp = path.join(srcDir, 'pages', filename);
  const raw = fs.readFileSync(fp, 'utf8');
  
  const extracted = comps.map(name => extractComponent(raw, name));
  const missing = comps.filter((_, i) => !extracted[i]);
  
  if (missing.length > 0) {
    console.error(`${filename}: MISSING components: ${missing.join(', ')}`);
    return;
  }
  
  const extra = fileExtraImports[filename] ? '\n' + fileExtraImports[filename] : '';
  const content = `${PI}${extra}

${extracted.join('\n\n')}

${fileExports[filename]}
`;
  write('pages/' + filename, content);
});

console.log('\nDone! Run: cd frontend && npm run build');
