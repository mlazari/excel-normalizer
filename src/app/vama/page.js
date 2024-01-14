'use client'

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import extractTextFromPDF from 'pdf-parser-client-side';

const trimString = x => typeof x === 'string' ? x.trim() : x;

const isNumber = x => typeof x === 'number' && isFinite(x);
const isDate = x => typeof x === 'string' && /^\d{1,2}\.\d{1,2}\.\d{2,4}$/g.test(x);
const isCustomDeclaration = x => x === 'Таможенная декларация';
const isBankOperation = x => x === 'Банковская операция (расход)';
const isDebtCorrection = x => x === 'Корректировка долга';
const isDocumentType = x => isCustomDeclaration(x) || isBankOperation(x) || isDebtCorrection(x);
const isDocumentNumber = x => typeof x === 'string' && !!x.length;

const isValidRow = row =>
  isNumber(row[1]) &&
  isDate(row[2]) &&
  isDocumentType(row[3]) &&
  isDocumentNumber(row[4]);

const parsePdfText = pdfText => {
  const pdfRows = [...pdfText.matchAll(/(Calculat|Pl\.Virament)\s+([^\s]+)\s+([^\s]+)\s+(?:[^\s]+)\s+(?:[^\s]+(?:\s+[^\s]+)?)\s+(\d+\.\d+)/g)];
  let pdfData = {};
  pdfRows.forEach(pdfRow => {
    let [, documentType, documentNumber, date, sum] = pdfRow;
    sum = Number(sum) + (pdfData[documentNumber]?.sum ?? 0);
    pdfData[documentNumber] = {
      documentType,
      date,
      sum,
    };
  });
  return pdfData;
};

const getDocNumberFromPdf = (pdfData, docNumberInExcel, dateInExcel, sumInExcel, shouldMatchByDateAndSumOnly) => {
  let docNumberInPdf = null;
  if (shouldMatchByDateAndSumOnly) {
    docNumberInPdf = Object.keys(pdfData).find(docNr => pdfData[docNr].date === dateInExcel && Math.abs(pdfData[docNr].sum - sumInExcel) <= 400) ?? null;
  } else {
    const docNumberSuffix = docNumberInExcel.match(/^[A-Z]0?(\d+)$/)?.[1];
    if (docNumberSuffix) {
      docNumberInPdf = Object.keys(pdfData).find(docNr => docNr.endsWith(docNumberSuffix) && pdfData[docNr].date === dateInExcel) ?? null;
    }
  }

  return docNumberInPdf;
};

const saveToFile = (pdfText, excelData, fileName) => {
  if (!pdfText?.length) {
    alert('Datele pdf lipsesc!');
    return;
  }
  if (!excelData?.parsedData?.length || !excelData?.parsedDataRaw?.length) {
    alert('Datele excel lipsesc!');
    return;
  }

  let pdfData = parsePdfText(pdfText);

  let aoa = [
    [],
    [
      '',
      '',
      '',
      '',
      '',
      'FORWARD INTERNATIONAL SRL',
      '',
      'Vama Chisinau',
      '',
    ],
    [
      '',
      'Nr.',
      'Data',
      'Document',
      'Nr. Document',
      'Debit',
      'Credit',
      'Debit',
      'Credit',
      '',
      'Diferenta',
      'Note'
    ]
  ];
  for (let i = 0; i < excelData.parsedData.length; ++i) {
    const documentNumber = trimString(excelData.parsedData[i].J);
    const docDate = trimString(excelData.parsedData[i].B);
    const docType = trimString(excelData.parsedData[i].D);
    const docSum = excelData.parsedDataRaw[i].AE;
    let documentNumberInPdf = isCustomDeclaration(docType) ? getDocNumberFromPdf(pdfData, documentNumber, docDate, docSum, false) : null;
    const row = [
      '',
      excelData.parsedDataRaw[i].A,
      docDate,
      docType,
      documentNumber,
      excelData.parsedDataRaw[i].AA,
      docSum,
      pdfData[documentNumberInPdf]?.sum,
      '',
      '',
      docSum ? { f: `G${aoa.length + 1}-H${aoa.length + 1}` } : { f: `I${aoa.length + 1}-F${aoa.length + 1}` }
    ];
    if (documentNumberInPdf in pdfData) delete pdfData[documentNumberInPdf];
    if (!isValidRow(row)) continue;
    aoa.push(row);
  }
  for (let i = 3; i < aoa.length; ++i) {
    if (!!aoa[i][7]) continue;
    let documentNumberInPdf = getDocNumberFromPdf(pdfData, aoa[i][4], aoa[i][2], isCustomDeclaration(aoa[i][3]) ? aoa[i][6] : aoa[i][5], true);
    if (aoa[i][6])
      aoa[i][7] = pdfData[documentNumberInPdf]?.sum;
    else
      aoa[i][8] = pdfData[documentNumberInPdf]?.sum;
    aoa[i].push(pdfData[documentNumberInPdf]?.sum ? /* `* nr. doc. vama (${documentNumberInPdf})` */ '' : '* negasit');
    if (documentNumberInPdf in pdfData) delete pdfData[documentNumberInPdf];
  }
  if (Object.keys(pdfData).length) {
    const month = '.' + aoa[3][2]?.match?.(/\d+\.(\d+)\.\d+/)?.[1] + '.';
    aoa.push([]);
    aoa.push([]);
    aoa.push([]);
    for (let docNr in pdfData) {
      if (!pdfData[docNr].date.includes(month)) continue;
      aoa.push([
        '',
        '',
        pdfData[docNr].date,
        pdfData[docNr].documentType,
        docNr,
        '',
        '',
        pdfData[docNr].documentType === 'Calculat' ? pdfData[docNr].sum : '',
        pdfData[docNr].documentType !== 'Calculat' ? pdfData[docNr].sum : ''
      ]);
    }
  }
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!merges'] = [
    { s: { c: 5, r: 1 }, e: { c: 6, r: 1 } },
    { s: { c: 7, r: 1 }, e: { c: 8, r: 1 } },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vama');
  XLSX.writeFile(workbook, fileName);
};

export default function VamaPage() {
  const [pdfText, setPdfText] = useState('');
  const [excelData, setExcelData] = useState({ parsedData: [], parsedDataRaw: [] });

  const [outputFileName, setOutputFileName] = useState('vama.xlsx');

  const handlePdfFileUpload = useCallback(e => {
    const file = e.target.files[0];
    if (file) {
      extractTextFromPDF(file).then((data) => {
        setPdfText(data);
      });
    }
  }, []);

  const handleExcelFileUpload = useCallback(e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      const outputTitle = file.name.toLowerCase().endsWith('.xlsx') ?
        `vama-${file.name}` :
        (file.name.toLowerCase().endsWith('.xls') ? `vama-${file.name}x` : `vama-${file.name}.xlsx`);
      setOutputFileName(outputTitle);
      reader.readAsBinaryString(file);
      reader.onload = e => {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary'});
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const parsedDataRaw = XLSX.utils.sheet_to_json(sheet, { header: 'A', raw: true });
        const parsedData = XLSX.utils.sheet_to_json(sheet, { header: 'A', raw: false });
        setExcelData({ parsedData, parsedDataRaw });
      };
    }
  }, [])

  const exportButtonDisabled = !pdfText?.length || !excelData?.parsedData?.length;

  const exportResult = useCallback(() => {
    saveToFile(pdfText, excelData, outputFileName);
  }, [excelData, outputFileName, pdfText]);
  
  return (
    <main className="flex h-screen w-screen flex-col items-center p-4">
      <div className="w-full p-1 flex flex-row items-center gap-2">
        <label htmlFor="pdfUploadInput">PDF</label>
        <input
          id="pdfUploadInput"
          type="file"
          accept=".pdf"
          onChange={handlePdfFileUpload}
        />
        <label htmlFor="excelUploadInput">Excel</label>
        <input
          id="excelUploadInput"
          type="file"
          accept=".xlsx, .xls"
          onChange={handleExcelFileUpload}
        />
        <button
          onClick={exportResult}
          className={`${exportButtonDisabled ? 'bg-slate-300' : 'bg-green-500 hover:bg-green-700'} mx-1 text-white font-bold py-1 px-4 rounded`}
          disabled={exportButtonDisabled}
        >
          Export
        </button>
      </div>
    </main>
  )
}
