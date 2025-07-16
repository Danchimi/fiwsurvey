const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
const fs = require('fs'); // ✅ Required to check if file exists

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
    password: 'Newcamer@237',
    //database: 'fragenbogen',
    database: 'fiwsurvey',
     
});

async function getQuestionTypes() {
  const [rows] = await db.query('SELECT id, type FROM questions');
  const map = {};
  rows.forEach(row => {
    map[parseInt(row.id)] = row.type;
  });
  console.log('✅ Loaded question types:', map);
  return map;
}

async function getOptionsMap() {
  const [rows] = await db.query('SELECT id, question_id, option_text FROM options');
  const map = {};
  for (const row of rows) {
    const qid = parseInt(row.question_id);
    if (!map[qid]) map[qid] = {};
    map[qid][row.option_text.trim().toLowerCase()] = row.id;
  }
  return map;
}

async function importSheet2022(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`❌ File not found: ${filepath}`);
  }

  const workbook = xlsx.readFile(filepath);
  const sheetName = '2022';

  if (!workbook.SheetNames.includes(sheetName)) {
    throw new Error('❌ Sheet "2022" not found in Excel file.');
  }

  const year = 2022;
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

  const questionTypes = await getQuestionTypes();
  const optionsMap = await getOptionsMap();

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];

    const [studentInsert] = await db.query(
      'INSERT INTO students (year, surveyForm_number) VALUES (?, ?)',
      [year, 0]
    );
    const student_id = studentInsert.insertId;

    const atomic = [];
    const checkbox = [];

    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const question_id = colIndex + 1;
      const raw = row[colIndex];
      if (!raw) continue;

      const cell = raw.toString().trim();
      const type = questionTypes[question_id];

      if (!type) {
        console.warn(`⚠️ Skipping unknown question_id ${question_id} for student ${student_id}`);
        continue;
      }

      if (type === 'checkbox' && cell.includes(';')) {
  const values = cell.split(';').map(s => s.trim());
  for (const answer of values) {
    const cleanedAnswer = answer.toLowerCase().trim();

    let option_id = null;
    if (optionsMap?.[question_id]) {
      for (const [text, id] of Object.entries(optionsMap[question_id])) {
        if (text.toLowerCase().trim() === cleanedAnswer) {
          option_id = id;
          break;
        }
      }
    }

    if (option_id) {
      checkbox.push([student_id, question_id, option_id, answer]);
    } else {
      console.warn(`⚠️ Option not found: Q${question_id} -> "${answer}"`);
    }
  }
}
 else if ((type === 'checkbox' || type === 'radio') && cell) {
        const option_id = optionsMap?.[question_id]?.[cell.toLowerCase()];
        if (option_id) {
          checkbox.push([student_id, question_id, option_id, cell]);
        } else {
          console.warn(`⚠️ Option not found: Q${question_id} -> "${cell}"`);
        }
      } else {
        atomic.push([student_id, question_id, cell]);
      }
    }

    // Insert atomic responses
    if (atomic.length > 0) {
      try {
        await db.query(
          'INSERT INTO responses_atomic (student_id, question_id, answer_text) VALUES ?',
          [atomic]
        );
      } catch (err) {
        console.error('❌ Error inserting atomic responses:', err.message);
      }
    }

    // Insert checkbox/radio responses
    if (checkbox.length > 0) {
      try {
        await db.query(
          'INSERT INTO responses_checkbox_selection (student_id, question_id, option_id, selected_checkbox) VALUES ?',
          [checkbox]
        );
      } catch (err) {
        console.error('❌ Error inserting checkbox responses:', err.message);
      }
    }

    console.log(`✅ Imported student ${student_id}: ${atomic.length} atomic, ${checkbox.length} checkbox`);
  }
}

importSheet2022('sheet2022.xlsx')
  .then(() => {
    console.log('✅ Import complete');
    process.exit();
  })
  .catch(err => {
    console.error('❌ Error during import:', err);
    process.exit(1);
  });