const fs = require('fs');
const file = 'd:/项目/erp-mes-system/frontend/src/pages/Dashboard.jsx';
let content = fs.readFileSync(file, 'utf8');

// Global background and text replacements
content = content.replace(/bg-gray-50\/50/g, 'bg-[#020617]');
content = content.replace(/bg-gray-50/g, 'bg-slate-900/50');
content = content.replace(/bg-white/g, 'bg-slate-900/80 backdrop-blur-md');
content = content.replace(/text-gray-800/g, 'text-white');
content = content.replace(/text-gray-500/g, 'text-slate-400');
content = content.replace(/text-gray-400/g, 'text-slate-500');
content = content.replace(/border-gray-100/g, 'border-slate-800');

// Card specific backgrounds
content = content.replace(/bg-blue-50/g, 'bg-blue-900/30');
content = content.replace(/bg-green-50/g, 'bg-green-900/30');
content = content.replace(/bg-orange-50/g, 'bg-orange-900/30');
content = content.replace(/bg-red-50/g, 'bg-red-900/30');
content = content.replace(/bg-teal-50/g, 'bg-teal-900/30');

content = content.replace(/bg-blue-100/g, 'bg-blue-500/20');
content = content.replace(/bg-green-100/g, 'bg-green-500/20');
content = content.replace(/bg-orange-100/g, 'bg-orange-500/20');
content = content.replace(/bg-red-100/g, 'bg-red-500/20');

// Grid lines for charts
content = content.replace(/stroke="#f1f5f9"/g, 'stroke="#1e293b"');

fs.writeFileSync(file, content);
console.log('Dashboard converted to dark mode.');
