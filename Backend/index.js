const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: 'Newcamer@237',
    database: 'fragenbogen'
};

const EXCEL_FILE = 'test.xlsx';
const PROCESSED_SUFFIX = '_imported';

async function importExcelToDatabase() {
  if (!fs.existsSync(EXCEL_FILE)) {
    console.log('Excel file not found.');
    return;
  }

  if (EXCEL_FILE.includes(PROCESSED_SUFFIX)) {
    console.log('This file has already been processed.');
    return;
  }

  const workbook = xlsx.readFile(EXCEL_FILE);
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length < 1) {
    console.log('No sheets found.');
    return;
  }

  const connection = await mysql.createConnection(DB_CONFIG);

  try {
    for (const sheetName of sheetNames) {
      const year = parseInt(sheetName);
      if (isNaN(year)) {
        console.log(`Invalid year format in sheet name: "${sheetName}"`);
        continue;
      }

      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

      for (const row of data) {
        if (row.length === 0) continue; // Skip empty rows

        // Insert a new student
        const [studentInsert] = await connection.execute(
          'INSERT INTO students (year) VALUES (?)',
          [year]
        );
        const studentId = studentInsert.insertId;

        // For each answer in the row, insert a response
        for (let questionIndex = 0; questionIndex < row.length; questionIndex++) {
          const answer = row[questionIndex]  === undefined ? null : row[questionIndex];
          const questionId = questionIndex + 1; // Assuming 1-based question IDs
          await connection.execute(
            'INSERT INTO responses (student_id, question_id, answer) VALUES (?, ?, ?)',
            [studentId, questionId, answer]
          );
        }
      }

      console.log(`Imported ${data.length} students from sheet "${sheetName}"`);
    }

    // Rename the file after import
    const parsedPath = path.parse(EXCEL_FILE);
    const newFileName = `${parsedPath.name}${PROCESSED_SUFFIX}${parsedPath.ext}`;
    fs.renameSync(EXCEL_FILE, newFileName);
    console.log(`Renamed Excel file to "${newFileName}"`);
  } catch (err) {
    console.error('Error importing data:', err);
  } finally {
    await connection.end();
  }
}

importExcelToDatabase();
