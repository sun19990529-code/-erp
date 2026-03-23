import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const PrintableQRCode = ({ value, label, size = 120 }) => {
  const printRef = useRef();
  const print = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>Print Label</title><style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .label-box { text-align: center; border: 2px dashed #ccc; padding: 20px; border-radius: 8px; }
      </style></head>
      <body>
        <div class="label-box">
          <h2>${label}</h2>
          <div>${printRef.current.innerHTML}</div>
          <p style="font-size: 12px; margin-top: 10px; color: #666;">${value}</p>
        </div>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body></html>
    `);
    printWindow.document.close();
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={printRef} className="bg-white p-2 rounded shadow-sm border">
        <QRCodeSVG value={value} size={size} level="H" />
      </div>
      <button type="button" onClick={print} className="text-sm px-3 py-1 bg-teal-50 text-teal-600 rounded hover:bg-teal-100 flex items-center gap-1">
        <i className="fas fa-print"></i> 打印标识
      </button>
    </div>
  );
};


export default PrintableQRCode;
