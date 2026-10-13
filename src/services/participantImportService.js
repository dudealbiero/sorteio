"use strict";

const path = require("node:path");
const { parse } = require("csv-parse/sync");
const ExcelJS = require("exceljs");
const HttpError = require("../utils/HttpError");

const MAX_IMPORTED_NAMES = 1000;
const ACCEPTED_EXTENSIONS = new Set([".csv", ".txt", ".xlsx"]);

function cleanName(value) {
  if (typeof value !== "string") throw new HttpError(400, "O nome do participante deve ser um texto.");
  const name = value.trim().normalize("NFC");
  if (name.length === 0) throw new HttpError(400, "Informe o nome do participante.");
  if (name.length > 120) throw new HttpError(400, "O nome pode ter no máximo 120 caracteres.");
  return name;
}

function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const candidates = [",", ";", "\t"];
  let selected = ",";
  let highestCount = -1;
  for (const delimiter of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let index = 0; index < firstLine.length; index += 1) {
      if (firstLine[index] === '"') {
        if (inQuotes && firstLine[index + 1] === '"') index += 1;
        else inQuotes = !inQuotes;
      } else if (!inQuotes && firstLine[index] === delimiter) count += 1;
    }
    if (count > highestCount) {
      highestCount = count;
      selected = delimiter;
    }
  }
  return selected;
}

function nameColumnIndex(row) {
  return row.findIndex((cell) => ["nome", "name", "participante", "participant"]
    .includes(String(cell || "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR")));
}

function rowsToNames(rows) {
  const nonEmptyRows = rows
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some(Boolean));
  if (nonEmptyRows.length === 0) throw new HttpError(400, "O arquivo não contém nomes de participantes.");
  let columnIndex = nameColumnIndex(nonEmptyRows[0]);
  let startIndex = 0;
  if (columnIndex >= 0) startIndex = 1;
  else columnIndex = 0;
  const names = nonEmptyRows.slice(startIndex).map((row) => row[columnIndex] || "").filter(Boolean);
  if (names.length === 0) {
    throw new HttpError(400, "Não foram encontrados nomes na primeira coluna ou em uma coluna chamada 'nome'.");
  }
  if (names.length > MAX_IMPORTED_NAMES) {
    throw new HttpError(400, `O arquivo pode conter no máximo ${MAX_IMPORTED_NAMES} nomes.`);
  }
  return names.map(cleanName);
}

async function readUploadedNames(file) {
  const extension = path.extname(file.originalname).toLocaleLowerCase("pt-BR");
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    throw new HttpError(400, "Formato não suportado. Envie um arquivo CSV, TXT ou XLSX.");
  }
  if (extension === ".xlsx") {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer);
    } catch {
      throw new HttpError(400, "Não foi possível ler o arquivo Excel. Confira se é um XLSX válido.");
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new HttpError(400, "A planilha não contém uma aba para importar.");
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push(row.values.slice(1).map((cell) => {
        if (cell && typeof cell === "object" && "text" in cell) return cell.text;
        return cell;
      }));
    });
    return rowsToNames(rows);
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer).replace(/^\uFEFF/, "");
  } catch {
    throw new HttpError(400, "O arquivo deve estar codificado em UTF-8.");
  }
  if (extension === ".txt") return rowsToNames(text.split(/\r?\n/).map((line) => [line]));
  try {
    return rowsToNames(parse(text, {
      bom: true,
      delimiter: detectCsvDelimiter(text),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    }));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, `Não foi possível ler o CSV: ${error.message}`);
  }
}

module.exports = { cleanName, readUploadedNames };
