'use client'

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

const columnColors = {
  1: 'bg-red-600',
  2: 'bg-yellow-600',
  3: 'bg-blue-600',
};

const columnSelectors = [
  { columnNumber: 1, title: 'Selecteaza coloana cod de bare' },
  { columnNumber: 2, title: 'Selecteaza coloana cantitate' },
  { columnNumber: 3, title: 'Selecteaza coloana discount' },
];

const cellTextColor = (column, selectedColumns) => {
  const columnNumber = Object.keys(selectedColumns).find(columnNumber => selectedColumns[columnNumber] === column);
  if (!columnNumber) return '';
  return ` ${columnColors[columnNumber]}`;
};

const isBarCode = x => /^[0-9]{7,13}$/.test(String(x).trim());
const isQuantity = x => !isBarCode(x) && !Number.isNaN(Number(String(x).trim()));
const isDiscount = x => !isBarCode(x) && !Number.isNaN(Number(String(x).trim()));

const isValidRow = (row, column1, column2, column3) => {
  if (!row || !column1 || !column2 || !column3) return false;
  return isBarCode(row[column1]) && isQuantity(row[column2]) && isDiscount(row[column3]);
};

const compareColumns = (column1, column2) => {
  if (column1 === column2) return 0;
  if (column1.length === column2.length) {
    return column1 < column2 ? -1 : 1;
  }
  return column1.length < column2.length ? -1 : 1;
};

const includesAny = (str, substrs) => {
  if (typeof str !== 'string') {
    return false;
  }
  for (let substr of substrs) {
    if (str.toLowerCase().includes(substr)) {
      return true;
    }
  }
  return false;
};

const guessColumnsByHeader = data => {
  let barCodeColumn = null, quantityColumn = null, discountColumn = null;
  for (let i = 0; i < data.length; ++i) {
    if (barCodeColumn) break;
    if (Object.keys(data[i]).length < 3) continue;
    for (let col in data[i]) {
      if (includesAny(data[i][col], ['bare', 'штрих'])) {
        barCodeColumn = col;
        for (let col2 in data[i]) {
          if (col2 === barCodeColumn) continue;
          if (includesAny(data[i][col2], ['cantitate', 'cant.', ',buc', ', buc', 'количество', 'кол-во', 'колво', ',шт', ', шт'])) {
            quantityColumn = col2;
            for (let col3 in data[i]) {
              if (col3 === barCodeColumn || col3 === quantityColumn) continue;
              if (includesAny(data[i][col3], ['reducere', 'discount', 'скидка', 'сумма скидки', 'diferen', 'разниц'])) {
                if (!discountColumn || data[i][col3].length < data[i][discountColumn].length) {
                  discountColumn = col3;
                }
              }
            }
            break;
          }
        }
        break;
      }
    }
  }

  return {
    1: barCodeColumn,
    2: quantityColumn,
    3: discountColumn,
  };
};

const guessColumns = (data, columns) => {
  if (!data || !columns) return {};

  const columnsByHeader = guessColumnsByHeader(data);

  let max = 0;
  let barCodeColumn = null, quantityColumn = null, discountColumn = null;

  if (columnsByHeader[1]) {
    barCodeColumn = columnsByHeader[1];
  } else {
    columns.forEach(column => {
      let cnt = 0;
      for (let i = 0; i < data.length; ++i) {
        if (isBarCode(data[i][column])) ++cnt;
      }
      if (!barCodeColumn || cnt > max) {
        max = cnt;
        barCodeColumn = column;
      }
    });
  }

  if (!barCodeColumn) {
    return {};
  }

  max = 0;

  if (columnsByHeader[2]) {
    quantityColumn = columnsByHeader[2];
  } else {
    columns.forEach(column => {
      if (column === barCodeColumn) return;
      let cnt = 0;
      for (let i = 0; i < data.length; ++i) {
        if (isBarCode(data[i][barCodeColumn]) && isQuantity(data[i][column])) ++cnt;
      }
      if (!quantityColumn || cnt > max) {
        max = cnt;
        quantityColumn = column;
      }
    });
  }

  if (!quantityColumn) {
    return {};
  }

  max = 0;

  if (columnsByHeader[3]) {
    discountColumn = columnsByHeader[3];
  } else {
    columns.forEach(column => {
      if (column === barCodeColumn || column === quantityColumn) return;
      let cnt = 0;
      for (let i = 0; i < data.length; ++i) {
        if (isBarCode(data[i][barCodeColumn]) && isQuantity(data[i][quantityColumn]) && isDiscount(data[i][column])) ++cnt;
      }
      if (!discountColumn || cnt > max) {
        max = cnt;
        discountColumn = column;
      }
    });
  }
  
  if (!discountColumn) {
    return {};
  }

  return {
    1: barCodeColumn,
    2: quantityColumn,
    3: discountColumn,
  };
};

const getAoa = (data, selectedColumns, unselectedRows, validRows) => {
  const validSelectedRowsCount = data.filter((_, i) => validRows[i] && !unselectedRows[i]).length;
  let aoa = [[{ f: `SUM(F3:F${validSelectedRowsCount + 2})` }], []];
  for (let i = 0; i < data.length; ++i) {
    if (!validRows[i] || unselectedRows[i]) {
      continue;
    }
    aoa.push([
      '',
      { f: `"${String(data[i][selectedColumns[1]]).trim()}"` },
      '',
      '',
      Math.abs(Number(String(data[i][selectedColumns[2]]).trim())),
      Math.abs(Number(String(data[i][selectedColumns[3]]).trim()))
    ]);
  }
  return aoa.length > 2 ? aoa : [];
};

const saveToFile = (aoa, fileName) => {
  if (!aoa.length) {
    alert('Nu sunt inregistrari de salvat!');
    return;
  }
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Discounts');
  XLSX.writeFile(workbook, fileName);
};

export default function Home() {
  const [data, setData] = useState([]);

  const columns = useMemo(() => {
    if (!data.length) return null;
    const columnsSet = new Set();
    for (let row = 0; row < data.length; ++row) {
      Object.keys(data[row]).forEach(column => columnsSet.add(column));
    }
    return Array.from(columnsSet).sort(compareColumns);
  }, [data]);

  const [selectedColumns, setSelectedColumns] = useState({});

  const [unselectedRows, setUnselectedRows] = useState({});

  const toggleRow = useCallback(rowIndex => {
    setUnselectedRows(currentUnselectedRows => ({ ...currentUnselectedRows, [rowIndex]: !currentUnselectedRows[rowIndex] }));
  }, []);

  const selectColumn = useCallback((columnNumber, column) => {
    setUnselectedRows({});
    setSelectedColumns(currentSelectedColumns => {
      const currentColumn = currentSelectedColumns[columnNumber];
      let moveExistingNumber = {};
      Object.keys(currentSelectedColumns).forEach(selectedColumnNumber => {
        if (selectedColumnNumber !== columnNumber && currentSelectedColumns[selectedColumnNumber] === column) {
          moveExistingNumber = { [selectedColumnNumber]: currentColumn };
        }
      });
      return ({ ...currentSelectedColumns, [columnNumber]: column, ...moveExistingNumber });
    });
  }, []);

  const validRows = useMemo(() => data.map(row => isValidRow(row, selectedColumns[1], selectedColumns[2], selectedColumns[3])), [data, selectedColumns]);

  const aoa = useMemo(() => getAoa(data, selectedColumns, unselectedRows, validRows), [data, selectedColumns, unselectedRows, validRows]);

  const [outputFileName, setOutputFileName] = useState('discounts.xlsx');

  const handleFileUpload = useCallback(e => {
    const reader = new FileReader();
    const outputTitle = e.target.files[0].name.toLowerCase().endsWith('.xlsx') ? `discounts-${e.target.files[0].name}` : `discounts-${e.target.files[0].name}.xlsx`;
    setOutputFileName(outputTitle);
    reader.readAsBinaryString(e.target.files[0]);
    reader.onload = e => {
      const data = e.target.result;
      const workbook = XLSX.read(data, { type: 'binary'});
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const parsedData = XLSX.utils.sheet_to_json(sheet, { header: 'A', raw: false });
      setSelectedColumns({});
      setUnselectedRows({});
      setData(parsedData);
    };
  }, [])

  useEffect(() => {
    setSelectedColumns(guessColumns(data, columns));
  }, [columns, data]);

  const exportButtonDisabled = !aoa.length;
  
  return (
    <main className="flex h-screen w-screen flex-col items-center p-4">
      <div className="w-full p-1 flex flex-row items-center">
        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileUpload}
        />
        {data.length > 0 && (
          <>
            <button
              onClick={() => setUnselectedRows({})}
              className={'mx-1 bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded'}
            >
              Selecteaza toate
            </button>
            <button
              onClick={() => setUnselectedRows(validRows)}
              className={'mx-1 bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded'}
            >
              Deselecteaza toate
            </button>
            <button
              onClick={() => saveToFile(aoa, outputFileName)}
              className={`${exportButtonDisabled ? 'bg-slate-300' : 'bg-green-500 hover:bg-green-700'} mx-1 text-white font-bold py-1 px-4 rounded`}
              disabled={exportButtonDisabled}
            >
              Export
            </button>
          </>
        )}
      </div>

      {!!columns && (
        <div className="max-w-full max-h-full overflow-auto">
          <table className="bg-white text-black select-none">
            <thead>
              <tr>
                {columns.map(column => (
                  <th key={column} className="bg-blue-100 border border-black p-0">
                    <div className="flex items-stretch">
                      <div className="flex flex-1 justify-center items-center px-1 py-1">{column}</div>
                      <div className="flex flex-col items-stretch bg-white text-sm">
                        {columnSelectors.map(({ columnNumber, title }) => (
                          <div
                            key={`${columnNumber}`}
                            className={`flex-1 px-1 cursor-pointer ${selectedColumns[columnNumber] === column ? columnColors[columnNumber] : 'hover:bg-blue-100'}`}
                            onClick={() => selectColumn(columnNumber, column)}
                            title={title}
                          >
                            {columnNumber}
                          </div>
                        ))}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr
                  key={index}
                  className={validRows[index] ? 'cursor-pointer hover:opacity-50' : 'bg-slate-100 text-gray-400'}
                  onClick={() => toggleRow(index)}
                  title={validRows[index] ? 'Click ca sa selectezi / deselectezi randul' : ''}
                >
                  {columns.map(column => (
                    <td key={`${column}${index}`} className={`border px-1 py-1${validRows[index] && !unselectedRows[index] ? cellTextColor(column, selectedColumns) : ''}`}>{row[column]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
