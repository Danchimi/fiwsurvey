// Backend: Node.js with Express
const express = require('express'); //Imports the Express.js framework for creating web applications.
const mysql = require('mysql2');//Imports the MySQL2 library for interacting with a MySQL database.
const cors = require('cors'); //Imports the CORS middleware to handle Cross-Origin Resource Sharing, allowing requests from different origins (e.g., a frontend running on a different port).
const app = express();
const port = 3000;

// Middleware
app.use(cors()); //Applies the CORS middleware to allow cross-origin requests
app.use(express.json()); //Applies middleware to parse incoming JSON data from requests.

// MySQL Database Connection
    const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Newcamer@237',
    database: 'fragenbogen',
     
  });
   

 db.connect(err => {
    if (err) throw err;
    console.log('Connected to MySQL');
  }); 
 


// Fetch questions with options
 app.get('/api/questions', (req, res) => {
    const sql = `
      SELECT q.id, q.text, q.type, GROUP_CONCAT(o.option_text) AS options 
      FROM questions q 
      LEFT JOIN options o ON q.id = o.question_id 
      GROUP BY q.id
    `;
  
    db.query(sql, (err, results) => {
      if (err) {
        console.error('Error fetching questions:', err);
        res.status(500).json({ error: 'Database error' });
      } else {
        // Parse options as an array
        const formattedResults = results.map(row => ({
          id: row.id,
          text: row.text,
          type: row.type,
          options: row.options ? row.options.split(',') : []
        }));
        res.json(formattedResults);
      }
    });
  }); 
  
// API Endpoint to Save Survey Responses
 app.post('/api/survey', (req, res) => {
    const { responses } = req.body;
    const currentYear = new Date().getFullYear();
  
     // Insert a new student and store the current year
     const studentSql = 'INSERT INTO students (year) VALUES (?)';
     db.query(studentSql, [currentYear], (err, studentResult) => {
       if (err) {
         console.error('Error inserting student:', err);
         return res.status(500).json({ error: 'Database error' }); 
       }
       const student_id = studentResult.insertId; // Get the new student ID
 
        
      //  Handle responses, including checkboxes + text
      const responseSql = 'INSERT INTO responses (student_id, question_id, answer) VALUES ?';
      const responseValues = responses.map(r => [student_id, r.question_id, JSON.stringify(r.answer)]);
  
      db.query(responseSql, [responseValues], (err, result) => {
        if (err) {
          console.error('Error saving responses:', err);
          return res.status(500).json({ error: 'Database error' });
        }
  
        res.status(200).json({ message: 'Survey responses saved successfully!', student_id });

      });
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

    // return array of years like [2023, 2022, 2021]
    const years = results.map(row => row.year);
    res.json(years);
  });
});

///Questions by year
app.get('/api/questions-by-year', (req, res) => {
  const year = req.query.year;

  const sql = `
    SELECT DISTINCT q.id, q.text
    FROM responses r
    JOIN questions q ON r.question_id = q.id
    JOIN students s ON r.student_id = s.id
    WHERE q.id IN (1, 2, 3, 4, 5, 6, 11, 15)
    AND s.year = ?
  `;

  db.query(sql, [year], (err, results) => {
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

  let sql = `
    SELECT 
        q.id AS question_id,
        q.text AS question_text,
        r.answer,
        s.year
    FROM responses r
    JOIN questions q ON r.question_id = q.id
    JOIN students s ON r.student_id = s.id
    WHERE q.id IN (1, 2, 3, 4, 5, 6, 11, 15)
  `;

  const params = [];

  if (selectedYear) {
    sql += ' AND s.year = ?';
    params.push(selectedYear);
  }

  if (selectedQuestionId) {
    sql += ' AND q.id = ?';
    params.push(selectedQuestionId);
  }

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query error" });
    }

    const questionMap = new Map();

    results.forEach(row => {
      const { question_id, question_text, answer } = row;

      if (!questionMap.has(question_id)) {
        questionMap.set(question_id, {
          question_id,
          question_text,
          answerCounts: new Map(),
          totalAnswerEntries: 0
        });
      }

      const qData = questionMap.get(question_id);

      const individualAnswers = answer
        ? answer.split(',').map(a => a.trim().replace(/^"+|"+$/g, '')).filter(Boolean)
        : [];

      individualAnswers.forEach(ans => {
        qData.totalAnswerEntries += 1;
        qData.answerCounts.set(ans, (qData.answerCounts.get(ans) || 0) + 1);
      });
    });

    const formattedData = Array.from(questionMap.values()).map(q => {
      const answers = Array.from(q.answerCounts.entries()).map(([answer, count]) => ({
        answer,
        percentage: ((count / q.totalAnswerEntries) * 100).toFixed(2)
      }));

      return {
        question_id: q.question_id,
        question_text: q.question_text,
        answers
      };
    });

    res.json(formattedData);
  });
});

 


app.listen(port, () => console.log(`Server running on port ${port}`));