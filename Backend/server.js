// Backend: Node.js with Express
const express = require('express'); //Imports the Express.js framework for creating web applications.
const mysql = require('mysql2');//Imports the MySQL2 library for interacting with a MySQL database.
const cors = require('cors'); //Imports the CORS middleware to handle Cross-Origin Resource Sharing, allowing requests from different origins (e.g., a frontend running on a different port).
const app = express();
const xlsx = require('xlsx');
const port = 3000;

// Middleware
app.use(cors()); //Applies the CORS middleware to allow cross-origin requests
app.use(express.json()); //Applies middleware to parse incoming JSON data from requests.

// MySQL Database Connection
    const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Newcamer@237',
    //database: 'fragenbogen',
    database: 'fiwsurvey',
     
  });
   

 db.connect(err => {
    if (err) throw err;
    console.log('Connected to MySQL');
  }); 
 

app.get('/api/questions', (req, res) => {
  const questionQuery = 'SELECT * FROM questions';
  const optionQuery = 'SELECT * FROM options';

  db.query(questionQuery, (err, questions) => {
    if (err) {
      console.error('Error fetching questions:', err);
      return res.status(500).json({ error: 'Error fetching questions' });
    }

    db.query(optionQuery, (err2, options) => {
      if (err2) {
        console.error('Error fetching options:', err2);
        return res.status(500).json({ error: 'Error fetching options' });
      }

      // Group options under each question
      const formattedQuestions = questions.map(q => {
        const qOptions = options
          .filter(o => o.question_id === q.id)
          .map(o => ({
            id: o.id,
            option_text: o.option_text,
            option_type: o.option_type
          }));

        return {
          id: q.id,
          text: q.text,
          type: q.type,
          options: qOptions
        };
      });

      res.json(formattedQuestions);
    });
  });
});

  
// API Endpoint to Save Survey Responses
 app.post('/api/survey', (req, res) => {
  const { surveyForm_number, atomic_responses, checkbox_responses } = req.body;
  const currentYear = new Date().getFullYear();

  // Step 1: Check if student exists
  const findStudentSql = `SELECT id FROM students WHERE surveyForm_number = ?`;

  db.query(findStudentSql, [surveyForm_number], (err, studentResults) => {
    if (err) {
      console.error('Error checking student:', err);
      return res.status(500).json({ error: 'Database error (student lookup)' });
    }

    if (studentResults.length > 0) {
      // Student exists — delete old responses first
      const student_id = studentResults[0].id;

      const deleteOldResponses = (callback) => {
        const deleteAtomic = `DELETE FROM responses_atomic WHERE student_id = ?`;
        const deleteCheckbox = `DELETE FROM responses_checkbox_selection WHERE student_id = ?`;

        db.query(deleteAtomic, [student_id], (err) => {
          if (err) return callback(err);
          db.query(deleteCheckbox, [student_id], callback);
        });
      };

      deleteOldResponses((deleteErr) => {
        if (deleteErr) {
          console.error('Error deleting old responses:', deleteErr);
          return res.status(500).json({ error: 'Error deleting previous responses' });
        }

        insertResponses(student_id);
      });

    } else {
      // Student does not exist — insert new
      const insertStudentSql = `INSERT INTO students (year, surveyForm_number) VALUES (?, ?)`;
      db.query(insertStudentSql, [currentYear, surveyForm_number], (err, insertResult) => {
        if (err) {
          console.error('Error inserting student:', err);
          return res.status(500).json({ error: 'Database error (insert student)' });
        }
        const student_id = insertResult.insertId;
        insertResponses(student_id);
      });
    }

    function insertResponses(student_id) {
      // Prepare atomic responses
      const atomicInserts = atomic_responses
        .filter(r => r.answer_text !== undefined && r.answer_text !== null && r.answer_text !== '')
        .map(r => [student_id, r.question_id, r.answer_text]);

      const checkboxInserts = checkbox_responses
        .filter(r => r.option_id && r.selected_checkbox)
        .map(r => [student_id, r.question_id, r.option_id, r.selected_checkbox]);

      const insertAtomicSql = `
        INSERT INTO responses_atomic (student_id, question_id, answer_text) VALUES ?
      `;

      const insertCheckboxSql = `
        INSERT INTO responses_checkbox_selection (student_id, question_id, option_id, selected_checkbox) VALUES ?
      `;

      const insertAtomic = () =>
        new Promise((resolve, reject) => {
          if (atomicInserts.length === 0) return resolve();
          db.query(insertAtomicSql, [atomicInserts], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      const insertCheckbox = () =>
        new Promise((resolve, reject) => {
          if (checkboxInserts.length === 0) return resolve();
          db.query(insertCheckboxSql, [checkboxInserts], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      // Run both insertions
      Promise.all([insertAtomic(), insertCheckbox()])
        .then(() => {
          res.status(200).json({
            message: 'Survey responses updated successfully!',
            student_id: student_id
          });
        })
        .catch(err => {
          console.error('Error saving responses:', err);
          res.status(500).json({ error: 'Error saving updated responses to database' });
        });
    }
  });
});





  //Selet year for diagram display
  //  NEW: Get available years from "students" table
app.get('/api/available-years', (req, res) => {
  db.query('SELECT DISTINCT year FROM students ORDER BY year DESC', (err, results) => {
    if (err) {
      console.error("Error fetching years:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // return array of years  [2022, 2024, 2025]
    const years = results.map(row => row.year);
    res.json(years);
  });
});

///Questions by year
/// Updated: Questions by year (supporting atomic + checkbox responses)
app.get('/api/questions-by-year', (req, res) => {
  const year = req.query.year;

  const sql = `
    SELECT DISTINCT q.id, q.text
    FROM students s

    -- Atomic responses
    JOIN responses_atomic ra ON ra.student_id = s.id
    JOIN questions q ON q.id = ra.question_id

    WHERE s.year = ?

    UNION

    SELECT DISTINCT q.id, q.text
    FROM students s

    -- Checkbox responses
    JOIN responses_checkbox_selection rc ON rc.student_id = s.id
    JOIN questions q ON q.id = rc.question_id

    WHERE s.year = ?
  `;

  db.query(sql, [year, year], (err, results) => {
    if (err) {
      console.error("Error fetching questions:", err);
      return res.status(500).json({ error: "Query error" });
    }
    res.json(results);
  });
});



///////////////////DIAGRAM
app.get('/api/question-results', (req, res) => {
  const selectedYear = req.query.year;
  const selectedQuestionId = req.query.questionId;

  if (!selectedQuestionId || !selectedYear) {
    return res.status(400).json({ error: "Missing year or questionId" });
  }

  const atomicSql = `
    SELECT q.id AS question_id, q.text AS question_text, ra.answer_text AS answer
    FROM responses_atomic ra
    JOIN students s ON s.id = ra.student_id
    JOIN questions q ON q.id = ra.question_id
    WHERE s.year = ? AND q.id = ?
  `;

  const checkboxSql = `
    SELECT q.id AS question_id, q.text AS question_text, rcs.selected_checkbox AS answer
    FROM responses_checkbox_selection rcs
    JOIN students s ON s.id = rcs.student_id
    JOIN questions q ON q.id = rcs.question_id
    WHERE s.year = ? AND q.id = ?
  `;

  const optionsSql = `
    SELECT question_id, option_text
    FROM options
    WHERE question_id = ?
  `;

  const year = selectedYear;
  const qid = parseInt(selectedQuestionId, 10);

  // Query atomic + checkbox + options in parallel
  Promise.all([
    new Promise((resolve, reject) =>
      db.query(atomicSql, [year, qid], (err, rows) => (err ? reject(err) : resolve(rows)))
    ),
    new Promise((resolve, reject) =>
      db.query(checkboxSql, [year, qid], (err, rows) => (err ? reject(err) : resolve(rows)))
    ),
    new Promise((resolve, reject) =>
      db.query(optionsSql, [qid], (err, rows) => (err ? reject(err) : resolve(rows)))
    )
  ])
    .then(([atomicRows, checkboxRows, optionRows]) => {
      const allResponses = [...atomicRows, ...checkboxRows];

      const questionText = allResponses[0]?.question_text || '';
      const answerCounts = new Map();
      let total = 0;

      allResponses.forEach(row => {
        if (row.answer) {
          const ans = row.answer.trim();
          answerCounts.set(ans, (answerCounts.get(ans) || 0) + 1);
          total += 1;
        }
      });

      // Add 0 counts for options not selected
      optionRows.forEach(opt => {
        if (!answerCounts.has(opt.option_text)) {
          answerCounts.set(opt.option_text, 0);
        }
      });

      const answers = Array.from(answerCounts.entries()).map(([answer, count]) => ({
        answer,
        percentage: total > 0 ? ((count / total) * 100).toFixed(2) : "0.00"
      }));

      res.json([
        {
          question_id: qid,
          question_text: questionText,
          answers
        }
      ]);
    })
    .catch(err => {
      console.error("Error in query:", err);
      res.status(500).json({ error: "Database error" });
    });
});

app.get('/api/question-results-multiyear', (req, res) => {
  const selectedQuestionId = parseInt(req.query.questionId, 10);

  if (!selectedQuestionId) {
    return res.status(400).json({ error: "Missing questionId" });
  }

  const atomicSql = `
    SELECT q.id AS question_id, q.text AS question_text, ra.answer_text AS answer, s.year
    FROM responses_atomic ra
    JOIN students s ON s.id = ra.student_id
    JOIN questions q ON q.id = ra.question_id
    WHERE q.id = ?
  `;

  const checkboxSql = `
    SELECT q.id AS question_id, q.text AS question_text, rcs.selected_checkbox AS answer, s.year
    FROM responses_checkbox_selection rcs
    JOIN students s ON s.id = rcs.student_id
    JOIN questions q ON q.id = rcs.question_id
    WHERE q.id = ?
  `;

  const optionsSql = `SELECT question_id, option_text FROM options WHERE question_id = ?`;

  Promise.all([
    new Promise((resolve, reject) =>
      db.query(atomicSql, [selectedQuestionId], (err, rows) => (err ? reject(err) : resolve(rows)))
    ),
    new Promise((resolve, reject) =>
      db.query(checkboxSql, [selectedQuestionId], (err, rows) => (err ? reject(err) : resolve(rows)))
    ),
    new Promise((resolve, reject) =>
      db.query(optionsSql, [selectedQuestionId], (err, rows) => (err ? reject(err) : resolve(rows)))
    )
  ])
    .then(([atomicRows, checkboxRows, optionRows]) => {
      const allResponses = [...atomicRows, ...checkboxRows];

      // Group responses by year
      const groupedByYear = new Map();

      allResponses.forEach(({ year, answer, question_id, question_text }) => {
        if (!answer || !year) return;

        if (!groupedByYear.has(year)) {
          groupedByYear.set(year, {
            year,
            question_id,
            question_text,
            answerCounts: new Map(),
            total: 0
          });
        }

        const group = groupedByYear.get(year);
        const cleanAnswer = answer.trim();

        group.total += 1;
        group.answerCounts.set(cleanAnswer, (group.answerCounts.get(cleanAnswer) || 0) + 1);
      });

      // Build full results including 0-count options
      const fullResult = [];

      groupedByYear.forEach(group => {
        const { year, question_id, question_text, answerCounts, total } = group;

        // Add missing options with 0%
        optionRows.forEach(opt => {
          if (!answerCounts.has(opt.option_text)) {
            answerCounts.set(opt.option_text, 0);
          }
        });

        const answers = Array.from(answerCounts.entries()).map(([answer, count]) => ({
          answer,
          percentage: total > 0 ? ((count / total) * 100).toFixed(2) : "0.00"
        }));

        fullResult.push({
          year,
          question_id,
          question_text,
          answers
        });
      });

      // Sort by year (optional)
      fullResult.sort((a, b) => a.year - b.year);

      res.json(fullResult);
    })
    .catch(err => {
      console.error("Error in multi-year query:", err);
      res.status(500).json({ error: "Database error" });
    });
});


 //edit form
app.get('/api/survey-by-number/:formNumber', (req, res) => {
  const formNumber = req.params.formNumber;

  const atomicResponsesSql = `
    SELECT q.id AS question_id, q.text AS question_text, q.type AS question_type, ra.answer_text AS answer
    FROM responses_atomic ra
    JOIN students s ON ra.student_id = s.id
    JOIN questions q ON ra.question_id = q.id
    WHERE s.surveyForm_number = ?
  `;

  const checkboxResponsesSql = `
    SELECT q.id AS question_id, q.text AS question_text, q.type AS question_type, rcs.selected_checkbox AS answer
    FROM responses_checkbox_selection rcs
    JOIN students s ON rcs.student_id = s.id
    JOIN questions q ON rcs.question_id = q.id
    WHERE s.surveyForm_number = ?
  `;

  // Combine the atomic and checkbox responses using a UNION
  const combinedSql = `
    (${atomicResponsesSql})
    UNION
    (${checkboxResponsesSql})
    ORDER BY question_id
  `;

  db.query(combinedSql, [formNumber, formNumber], (err, results) => {
    if (err) {
      console.error('Error fetching form:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(results);
  });
});


app.listen(port, () => console.log(`Server running on port ${port}`));